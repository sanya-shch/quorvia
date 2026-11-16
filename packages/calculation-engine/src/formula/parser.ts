import {
  FORMULA_LIMITS,
  FormulaError,
  type BinaryOp,
  type FormulaDiagnostic,
  type FormulaNode,
} from "./types.js";

/**
 * Tokenizer + Pratt parser. There is no eval and no `new Function`: a formula is text that becomes
 * a small tree, and the tree is walked by evaluate.ts. Length, node count, nesting and literal
 * sizes are capped, so parsing and evaluating always finish quickly.
 */

type Token =
  | { type: "num" | "str" | "ref" | "ident" | "kw" | "op"; value: string; pos: number; end: number }
  | { type: "eof"; value: ""; pos: number; end: number };

const KEYWORDS = new Set(["TRUE", "FALSE", "AND", "OR", "NOT"]);
const REF = /^\{q:([A-Za-z0-9_-]{1,64})\}/;

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= "0" && ch <= "9";
const isIdentStart = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z_]/.test(ch);
const isIdentChar = (ch: string | undefined): boolean => isIdentStart(ch) || isDigit(ch);

const tokenize = (src: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i]!;

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (isDigit(ch)) {
      let j = i;

      while (isDigit(src[j])) j += 1;

      if (src[j] === ".") {
        j += 1;
        if (!isDigit(src[j]))
          throw new FormulaError("BAD_NUMBER", "A digit must follow the decimal point.", i, j);
        while (isDigit(src[j])) j += 1;
      }

      if (isIdentChar(src[j]) || j - i > FORMULA_LIMITS.maxNumberLength) {
        throw new FormulaError("BAD_NUMBER", "Invalid number.", i, Math.max(j, i + 1));
      }

      tokens.push({ type: "num", value: src.slice(i, j), pos: i, end: j });
      i = j;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let value = "";

      for (;;) {
        const c = src[j];

        if (c === undefined)
          throw new FormulaError("BAD_STRING", "The string is not closed.", i, src.length);
        if (c === '"') break;

        if (c === "\\") {
          const next = src[j + 1];

          if (next !== '"' && next !== "\\") {
            throw new FormulaError(
              "BAD_STRING",
              'Only \\" and \\\\ can follow a backslash.',
              j,
              j + 2,
            );
          }

          value += next;
          j += 2;
        } else {
          value += c;
          j += 1;
        }

        if (value.length > FORMULA_LIMITS.maxStringLength) {
          throw new FormulaError("BAD_STRING", "The string is too long.", i, j);
        }
      }

      tokens.push({ type: "str", value, pos: i, end: j + 1 });
      i = j + 1;
      continue;
    }

    if (ch === "{") {
      const match = REF.exec(src.slice(i, i + 80));

      if (!match)
        throw new FormulaError(
          "BAD_REFERENCE",
          "A question reference looks like {q:id}.",
          i,
          i + 1,
        );

      tokens.push({ type: "ref", value: match[1]!, pos: i, end: i + match[0].length });
      i += match[0].length;
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i;

      while (isIdentChar(src[j])) j += 1;

      const text = src.slice(i, j).toUpperCase();

      tokens.push({ type: KEYWORDS.has(text) ? "kw" : "ident", value: text, pos: i, end: j });
      i = j;
      continue;
    }

    const two = src.slice(i, i + 2);

    if (two === "<=" || two === ">=" || two === "!=") {
      tokens.push({ type: "op", value: two, pos: i, end: i + 2 });
      i += 2;
      continue;
    }

    if ("+-*/%(),".includes(ch) || ch === "=" || ch === "<" || ch === ">") {
      tokens.push({ type: "op", value: ch, pos: i, end: i + 1 });
      i += 1;
      continue;
    }

    throw new FormulaError("UNEXPECTED_CHARACTER", `Unexpected character "${ch}".`, i, i + 1);
  }

  tokens.push({ type: "eof", value: "", pos: src.length, end: src.length });

  return tokens;
};

// Binding powers, weakest first: OR < AND < NOT < comparison < + - < * / % < unary minus.
const INFIX: Readonly<Record<string, number>> = {
  OR: 10,
  AND: 20,
  "=": 40,
  "!=": 40,
  "<": 40,
  "<=": 40,
  ">": 40,
  ">=": 40,
  "+": 50,
  "-": 50,
  "*": 60,
  "/": 60,
  "%": 60,
};
const NOT_BP = 30;
const NEGATE_BP = 70;
// Recursion guard for parentheses and nested calls (the node cap does not count parentheses).
const MAX_RECURSION = 60;

class Parser {
  private index = 0;
  private nodes = 0;
  private level = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.index]!;
  }

  private next(): Token {
    const token = this.tokens[this.index]!;

    if (token.type !== "eof") this.index += 1;

    return token;
  }

  private node<T extends FormulaNode>(node: T): T {
    this.nodes += 1;

    if (this.nodes > FORMULA_LIMITS.maxNodes) {
      throw new FormulaError(
        "TOO_MANY_NODES",
        `A formula has at most ${FORMULA_LIMITS.maxNodes} elements.`,
        node.pos,
        node.end,
      );
    }

    return node;
  }

  private fail(token: Token, expected: string): never {
    if (token.type === "eof") {
      throw new FormulaError(
        "UNEXPECTED_END",
        `The formula ended unexpectedly; expected ${expected}.`,
        token.pos,
        token.pos,
      );
    }

    throw new FormulaError(
      "UNEXPECTED_TOKEN",
      `Unexpected "${token.value}"; expected ${expected}.`,
      token.pos,
      token.end,
    );
  }

  private expect(op: string): Token {
    const token = this.peek();

    if (token.type !== "op" || token.value !== op) this.fail(token, `"${op}"`);

    return this.next();
  }

  parse(): FormulaNode {
    const ast = this.expr(0);
    const rest = this.peek();

    if (rest.type !== "eof") this.fail(rest, "an operator or the end of the formula");

    return ast;
  }

  private expr(minBp: number): FormulaNode {
    this.level += 1;

    if (this.level > MAX_RECURSION) {
      throw new FormulaError(
        "DEPTH_LIMIT",
        "The formula is nested too deeply.",
        this.peek().pos,
        this.peek().end,
      );
    }

    let left = this.prefix();

    for (;;) {
      const token = this.peek();
      const bp = token.type === "op" || token.type === "kw" ? INFIX[token.value] : undefined;

      if (bp === undefined || bp <= minBp) break;

      this.next();

      const right = this.expr(bp);

      left = this.node({
        kind: "binary",
        op: token.value as BinaryOp,
        left,
        right,
        pos: left.pos,
        end: right.end,
      });
    }

    this.level -= 1;

    return left;
  }

  private prefix(): FormulaNode {
    const token = this.next();

    switch (token.type) {
      case "num":
        return this.node({ kind: "num", value: token.value, pos: token.pos, end: token.end });
      case "str":
        return this.node({ kind: "str", value: token.value, pos: token.pos, end: token.end });
      case "ref":
        return this.node({ kind: "ref", id: token.value, pos: token.pos, end: token.end });
      case "kw": {
        if (token.value === "TRUE" || token.value === "FALSE") {
          return this.node({
            kind: "bool",
            value: token.value === "TRUE",
            pos: token.pos,
            end: token.end,
          });
        }

        if (token.value === "NOT") {
          const arg = this.expr(NOT_BP);

          return this.node({ kind: "unary", op: "NOT", arg, pos: token.pos, end: arg.end });
        }

        return this.fail(token, "a value");
      }
      case "ident":
        return this.call(token);
      case "op": {
        if (token.value === "-") {
          const arg = this.expr(NEGATE_BP);

          return this.node({ kind: "unary", op: "-", arg, pos: token.pos, end: arg.end });
        }

        if (token.value === "(") {
          const inner = this.expr(0);

          this.expect(")");

          return inner;
        }

        return this.fail(token, "a value");
      }
      default:
        return this.fail(token, "a value");
    }
  }

  private call(name: Token): FormulaNode {
    if (this.peek().type !== "op" || this.peek().value !== "(") {
      throw new FormulaError(
        "UNKNOWN_IDENTIFIER",
        `Unknown name "${name.value}". Functions are written like ${name.value}(...).`,
        name.pos,
        name.end,
      );
    }

    this.next();

    const args: FormulaNode[] = [];

    if (this.peek().type === "op" && this.peek().value === ")") {
      this.next();
    } else {
      for (;;) {
        args.push(this.expr(0));

        const sep = this.peek();

        if (sep.type === "op" && sep.value === ",") {
          this.next();
          continue;
        }

        break;
      }

      this.expect(")");
    }

    const close = this.tokens[this.index - 1]!;

    return this.node({ kind: "call", name: name.value, args, pos: name.pos, end: close.end });
  }
}

export const astDepth = (node: FormulaNode): number => {
  switch (node.kind) {
    case "unary":
      return 1 + astDepth(node.arg);
    case "binary":
      return 1 + Math.max(astDepth(node.left), astDepth(node.right));
    case "call":
      return 1 + node.args.reduce((deepest, arg) => Math.max(deepest, astDepth(arg)), 0);
    default:
      return 1;
  }
};

export type ParseResult = { ok: true; ast: FormulaNode } | { ok: false; error: FormulaDiagnostic };

/** Parses a formula. Never throws: the first problem is returned with its position. */
export const parseFormula = (source: string): ParseResult => {
  try {
    if (source.trim() === "")
      throw new FormulaError("EMPTY_FORMULA", "The formula is empty.", 0, 0);

    if (source.length > FORMULA_LIMITS.maxLength) {
      throw new FormulaError(
        "FORMULA_TOO_LONG",
        `A formula has at most ${FORMULA_LIMITS.maxLength} characters.`,
        FORMULA_LIMITS.maxLength,
        source.length,
      );
    }

    const ast = new Parser(tokenize(source)).parse();

    if (astDepth(ast) > FORMULA_LIMITS.maxDepth) {
      throw new FormulaError(
        "DEPTH_LIMIT",
        `The formula is nested more than ${FORMULA_LIMITS.maxDepth} levels deep; use SUM(...) instead of long chains of +.`,
        ast.pos,
        ast.end,
      );
    }

    return { ok: true, ast };
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error: error.toDiagnostic() };

    throw error;
  }
};

/** Ids of the questions a formula refers to, in order of first use, without duplicates. */
export const collectRefs = (node: FormulaNode, into: Set<string> = new Set()): Set<string> => {
  switch (node.kind) {
    case "ref":
      into.add(node.id);
      break;
    case "unary":
      collectRefs(node.arg, into);
      break;
    case "binary":
      collectRefs(node.left, into);
      collectRefs(node.right, into);
      break;
    case "call":
      for (const arg of node.args) collectRefs(arg, into);
      break;
    default:
  }

  return into;
};

/**
 * Rewrites the question references of a formula with `idMap` (old id -> new id), for copying a form:
 * the copy's questions get new ids. A reference inside a string literal is left alone; a formula
 * that does not parse falls back to a plain text replacement, so nothing keeps pointing at the
 * original form.
 */
export const remapFormulaRefs = (source: string, idMap: ReadonlyMap<string, string>): string => {
  const parsed = parseFormula(source);
  const spans: { pos: number; end: number; id: string }[] = [];

  if (parsed.ok) {
    const walk = (node: FormulaNode): void => {
      switch (node.kind) {
        case "ref":
          spans.push({ pos: node.pos, end: node.end, id: node.id });
          break;
        case "unary":
          walk(node.arg);
          break;
        case "binary":
          walk(node.left);
          walk(node.right);
          break;
        case "call":
          node.args.forEach(walk);
          break;
        default:
      }
    };

    walk(parsed.ast);
  } else {
    for (const match of source.matchAll(/\{q:([A-Za-z0-9_-]{1,64})\}/g)) {
      spans.push({ pos: match.index, end: match.index + match[0].length, id: match[1]! });
    }
  }

  let result = source;

  // From the end, so the earlier positions stay valid.
  for (const span of spans.sort((a, b) => b.pos - a.pos)) {
    const next = idMap.get(span.id);

    if (next !== undefined)
      result = `${result.slice(0, span.pos)}{q:${next}}${result.slice(span.end)}`;
  }

  return result;
};

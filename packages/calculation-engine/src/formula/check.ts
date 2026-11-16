import {
  FORMULA_LIMITS,
  FormulaError,
  type CalculationConfig,
  type FormulaDiagnostic,
  type FormulaNode,
  type FormulaQuestion,
  type FormulaType,
} from "./types.js";
import { parseFormula } from "./parser.js";

/** What a bare reference to a question gives, or null when the question type is not supported. */
export const refTypeOf = (question: FormulaQuestion): FormulaType | null => {
  switch (question.type) {
    case "NUMBER":
    case "RATING":
    case "SCALE":
    case "NPS":
    // A choice gives its points (option.score): the price of the picked option, for instance.
    case "CHOICE_SINGLE":
    case "IMAGE_CHOICE":
    case "CHOICE_MULTI":
      return "number";
    case "BOOLEAN":
      return "boolean";
    case "TEXT":
      return "string";
    case "CALCULATION": {
      const type = question.config?.resultType;

      return type === "number" || type === "string" || type === "boolean" ? type : null;
    }
    default:
      // DATE, RANKING, MATRIX, FILE
      return null;
  }
};

interface FunctionSpec {
  min: number;
  max: number;
}

const MANY = 100;

export const FORMULA_FUNCTIONS: ReadonlyMap<string, FunctionSpec> = new Map([
  ["IF", { min: 3, max: 3 }],
  ["ROUND", { min: 1, max: 2 }],
  ["FLOOR", { min: 1, max: 2 }],
  ["CEIL", { min: 1, max: 2 }],
  ["ABS", { min: 1, max: 1 }],
  ["MIN", { min: 1, max: MANY }],
  ["MAX", { min: 1, max: MANY }],
  ["SUM", { min: 1, max: MANY }],
  ["AVG", { min: 1, max: MANY }],
  ["COUNT", { min: 1, max: 1 }],
  ["CONCAT", { min: 1, max: MANY }],
  ["UPPER", { min: 1, max: 1 }],
  ["LOWER", { min: 1, max: 1 }],
  ["SCORE", { min: 1, max: 1 }],
  ["LABEL", { min: 1, max: 1 }],
]);

type Questions = ReadonlyMap<string, FormulaQuestion>;

const mismatch = (node: FormulaNode, expected: string, actual: string): never => {
  throw new FormulaError(
    "TYPE_MISMATCH",
    `Expected ${expected}, got ${actual}.`,
    node.pos,
    node.end,
  );
};

const expectType = (node: FormulaNode, actual: FormulaType, expected: FormulaType): void => {
  if (actual !== expected) mismatch(node, expected, actual);
};

// COUNT / LABEL / SCORE take the question itself, not its value.
const questionArg = (
  node: FormulaNode,
  questions: Questions,
  allowed: readonly string[],
  what: string,
) => {
  if (node.kind !== "ref") {
    throw new FormulaError(
      "TYPE_MISMATCH",
      `Expected a question reference ${what}.`,
      node.pos,
      node.end,
    );
  }

  const question = questions.get(node.id);

  if (!question)
    throw new FormulaError(
      "UNKNOWN_REFERENCE",
      "This question does not exist.",
      node.pos,
      node.end,
    );

  if (!allowed.includes(question.type)) {
    throw new FormulaError(
      "UNSUPPORTED_REFERENCE",
      `Expected a question of type ${what}.`,
      node.pos,
      node.end,
    );
  }
};

const typeOf = (node: FormulaNode, questions: Questions): FormulaType => {
  switch (node.kind) {
    case "num":
      return "number";
    case "str":
      return "string";
    case "bool":
      return "boolean";
    case "ref": {
      const question = questions.get(node.id);

      if (!question)
        throw new FormulaError(
          "UNKNOWN_REFERENCE",
          "This question does not exist.",
          node.pos,
          node.end,
        );

      const type = refTypeOf(question);

      if (!type) {
        throw new FormulaError(
          "UNSUPPORTED_REFERENCE",
          `Questions of type ${question.type} cannot be used in formulas.`,
          node.pos,
          node.end,
        );
      }

      return type;
    }
    case "unary": {
      const arg = typeOf(node.arg, questions);

      expectType(node.arg, arg, node.op === "-" ? "number" : "boolean");

      return node.op === "-" ? "number" : "boolean";
    }
    case "binary": {
      const left = typeOf(node.left, questions);
      const right = typeOf(node.right, questions);

      switch (node.op) {
        case "+":
        case "-":
        case "*":
        case "/":
        case "%":
          expectType(node.left, left, "number");
          expectType(node.right, right, "number");
          return "number";
        case "<":
        case "<=":
        case ">":
        case ">=":
          expectType(node.left, left, "number");
          expectType(node.right, right, "number");
          return "boolean";
        case "=":
        case "!=":
          expectType(node.right, right, left);
          return "boolean";
        default:
          // AND, OR
          expectType(node.left, left, "boolean");
          expectType(node.right, right, "boolean");
          return "boolean";
      }
    }
    case "call":
      return callType(node, questions);
  }
};

const callType = (
  node: Extract<FormulaNode, { kind: "call" }>,
  questions: Questions,
): FormulaType => {
  const spec = FORMULA_FUNCTIONS.get(node.name);

  if (!spec)
    throw new FormulaError(
      "UNKNOWN_FUNCTION",
      `Unknown function ${node.name}.`,
      node.pos,
      node.pos + node.name.length,
    );

  if (node.args.length < spec.min || node.args.length > spec.max) {
    const range =
      spec.min === spec.max
        ? `${spec.min}`
        : spec.max === MANY
          ? `at least ${spec.min}`
          : `${spec.min} to ${spec.max}`;

    throw new FormulaError(
      "ARITY",
      `${node.name} takes ${range} argument(s), got ${node.args.length}.`,
      node.pos,
      node.end,
    );
  }

  const [first] = node.args as [FormulaNode, ...FormulaNode[]];

  switch (node.name) {
    case "COUNT":
      questionArg(first, questions, ["CHOICE_MULTI"], "CHOICE_MULTI");
      return "number";
    case "LABEL":
      questionArg(
        first,
        questions,
        ["CHOICE_SINGLE", "IMAGE_CHOICE"],
        "CHOICE_SINGLE or IMAGE_CHOICE",
      );
      return "string";
    case "SCORE":
      questionArg(
        first,
        questions,
        ["CHOICE_SINGLE", "IMAGE_CHOICE", "CHOICE_MULTI", "BOOLEAN"],
        "CHOICE_SINGLE, CHOICE_MULTI, IMAGE_CHOICE or BOOLEAN",
      );
      return "number";
    case "IF": {
      expectType(first, typeOf(first, questions), "boolean");

      const whenTrue = typeOf(node.args[1]!, questions);

      expectType(node.args[2]!, typeOf(node.args[2]!, questions), whenTrue);

      return whenTrue;
    }
    case "CONCAT":
      for (const arg of node.args) typeOf(arg, questions);
      return "string";
    case "UPPER":
    case "LOWER":
      expectType(first, typeOf(first, questions), "string");
      return "string";
    default:
      // ROUND, FLOOR, CEIL, ABS, MIN, MAX, SUM, AVG: numbers in, number out.
      for (const arg of node.args) expectType(arg, typeOf(arg, questions), "number");
      return "number";
  }
};

export type CheckResult = { ok: true; type: FormulaType } | { ok: false; error: FormulaDiagnostic };

/** Type-checks a parsed formula against the form's questions. Never throws. */
export const checkFormula = (ast: FormulaNode, questions: Questions): CheckResult => {
  try {
    return { ok: true, type: typeOf(ast, questions) };
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error: error.toDiagnostic() };

    throw error;
  }
};

export type AnalyzeResult =
  { ok: true; type: FormulaType; ast: FormulaNode } | { ok: false; error: FormulaDiagnostic };

/**
 * Parse + type-check + check that the declared `resultType` and `decimals` fit: what the builder
 * calls on every edit and the server on save.
 */
export const analyzeFormula = (
  config: Pick<CalculationConfig, "formula" | "resultType" | "decimals">,
  questions: Questions,
): AnalyzeResult => {
  const parsed = parseFormula(config.formula);

  if (!parsed.ok) return parsed;

  const checked = checkFormula(parsed.ast, questions);

  if (!checked.ok) return checked;

  const whole = { pos: 0, end: config.formula.length };

  if (checked.type !== config.resultType) {
    return {
      ok: false,
      error: {
        code: "TYPE_MISMATCH",
        message: `The formula gives ${checked.type}, but the result type is ${config.resultType}.`,
        ...whole,
      },
    };
  }

  const decimals = config.decimals;

  if (
    decimals !== undefined &&
    (!Number.isInteger(decimals) || decimals < 0 || decimals > FORMULA_LIMITS.maxDecimals)
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_CONFIG",
        message: `Decimals must be a whole number from 0 to ${FORMULA_LIMITS.maxDecimals}.`,
        ...whole,
      },
    };
  }

  return { ok: true, type: checked.type, ast: parsed.ast };
};

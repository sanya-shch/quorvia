import {
  D,
  MAX_INTERMEDIATE,
  MAX_RESULT,
  MAX_RESULT_DIGITS,
  ROUND_CEIL,
  ROUND_FLOOR,
  ROUND_HALF_UP,
  type Dec,
} from "./decimal.js";
import {
  EvalError,
  FORMULA_LIMITS,
  type CalcValue,
  type CalculationConfig,
  type EvalErrorCode,
  type FormulaNode,
  type FormulaQuestion,
} from "./types.js";

type Value = Dec | string | boolean;

export interface EvalEnv {
  questions: ReadonlyMap<string, FormulaQuestion>;
  answers: Readonly<Record<string, unknown>>;
  // Questions the respondent was shown; null means all. A hidden question counts as empty.
  visibleIds: ReadonlySet<string> | null;
  // Already computed calculation fields (the engine fills it in dependency order).
  calcValues: ReadonlyMap<string, CalcValue | null>;
  emptyAsZero: boolean;
}

const EMPTY = Symbol("empty");
type Raw = Value | typeof EMPTY;

const toDec = (n: number): Dec => new D(String(n));

// `answers` comes from JSON: never read inherited keys such as "__proto__".
const answerOf = (env: EvalEnv, id: string): unknown =>
  Object.prototype.hasOwnProperty.call(env.answers, id) ? env.answers[id] : undefined;

const guard = (value: Dec): Dec => {
  if (!value.isFinite() || value.abs().gt(MAX_INTERMEDIATE)) throw new EvalError("OVERFLOW");

  return value;
};

const optionPoints = (question: FormulaQuestion, optionId: unknown): Dec | null => {
  const option = question.options?.find((o) => o.id === optionId);

  return option
    ? toDec(typeof option.score === "number" && Number.isFinite(option.score) ? option.score : 0)
    : null;
};

// The value of a question for the formula, or EMPTY when there is none.
const readQuestion = (question: FormulaQuestion, env: EvalEnv): Raw => {
  if (question.type === "CALCULATION") {
    const value = env.calcValues.get(question.id);

    if (value === undefined || value === null) return EMPTY;

    return typeof value === "number" ? toDec(value) : value;
  }

  if (env.visibleIds && !env.visibleIds.has(question.id)) return EMPTY;

  const answer = answerOf(env, question.id);

  switch (question.type) {
    case "NUMBER":
    case "RATING":
    case "SCALE":
    case "NPS":
      return typeof answer === "number" && Number.isFinite(answer) ? toDec(answer) : EMPTY;
    case "CHOICE_SINGLE":
    case "IMAGE_CHOICE":
      return optionPoints(question, answer) ?? EMPTY;
    case "CHOICE_MULTI": {
      if (!Array.isArray(answer)) return EMPTY;

      const picked = new Set(answer);
      let total = new D(0);
      let any = false;

      for (const option of question.options ?? []) {
        if (picked.has(option.id)) {
          total = total.plus(optionPoints(question, option.id)!);
          any = true;
        }
      }

      return any ? total : EMPTY;
    }
    case "BOOLEAN":
      return typeof answer === "boolean" ? answer : EMPTY;
    case "TEXT":
      return typeof answer === "string" && answer !== "" ? answer : EMPTY;
    default:
      return EMPTY;
  }
};

const emptyValue = (question: FormulaQuestion, env: EvalEnv): Value => {
  if (!env.emptyAsZero) throw new EvalError("EMPTY_REFERENCE");

  switch (question.type === "CALCULATION" ? question.config?.resultType : undefined) {
    case "string":
      return "";
    case "boolean":
      return false;
    case "number":
      return new D(0);
    default:
  }

  if (question.type === "BOOLEAN") return false;
  if (question.type === "TEXT") return "";

  return new D(0);
};

const num = (value: Value): Dec => {
  if (!D.isDecimal(value)) throw new EvalError("INVALID_ARGUMENT");

  return value;
};
const bool = (value: Value): boolean => {
  if (typeof value !== "boolean") throw new EvalError("INVALID_ARGUMENT");

  return value;
};
const text = (value: Value): string => {
  if (typeof value !== "string") throw new EvalError("INVALID_ARGUMENT");

  return value;
};

const asText = (value: Value): string =>
  D.isDecimal(value)
    ? value.toFixed()
    : typeof value === "boolean"
      ? value
        ? "TRUE"
        : "FALSE"
      : value;

const digits = (value: Value | undefined): number => {
  if (value === undefined) return 0;

  const d = num(value);

  if (!d.isInteger() || d.lt(0) || d.gt(FORMULA_LIMITS.maxDecimals))
    throw new EvalError("INVALID_ARGUMENT");

  return d.toNumber();
};

const ref = (node: Extract<FormulaNode, { kind: "ref" }>, env: EvalEnv): Value => {
  const question = env.questions.get(node.id);

  // The type checker rejects unknown references on save; stored data that slipped through is an error.
  if (!question) throw new EvalError("INVALID_FORMULA");

  const raw = readQuestion(question, env);

  return raw === EMPTY ? emptyValue(question, env) : raw;
};

const call = (node: Extract<FormulaNode, { kind: "call" }>, env: EvalEnv): Value => {
  const { name, args } = node;
  const first = args[0]!;

  // These look at the question itself, not at a plain value.
  if (name === "COUNT" || name === "LABEL" || name === "SCORE") {
    const question = first.kind === "ref" ? env.questions.get(first.id) : undefined;

    if (!question) throw new EvalError("INVALID_FORMULA");

    const hidden = env.visibleIds !== null && !env.visibleIds.has(question.id);
    const answer = hidden ? undefined : answerOf(env, question.id);

    if (name === "COUNT") {
      const options = new Set((question.options ?? []).map((o) => o.id));

      return new D(
        Array.isArray(answer) ? new Set(answer.filter((id) => options.has(id))).size : 0,
      );
    }

    if (name === "LABEL") {
      const option = question.options?.find((o) => o.id === answer);

      if (!option && !env.emptyAsZero) throw new EvalError("EMPTY_REFERENCE");

      return option?.text ?? "";
    }

    // SCORE
    if (question.type === "BOOLEAN") {
      const points =
        typeof answer === "boolean"
          ? answer
            ? question.config?.score?.true
            : question.config?.score?.false
          : undefined;

      if (typeof answer !== "boolean" && !env.emptyAsZero) throw new EvalError("EMPTY_REFERENCE");

      return toDec(typeof points === "number" && Number.isFinite(points) ? points : 0);
    }

    const raw = readQuestion(question, env);

    return raw === EMPTY ? emptyValue(question, env) : (raw as Dec);
  }

  if (name === "IF") {
    // Only the branch that is taken is evaluated, so IF(x = 0, 0, 100 / x) is safe.
    return bool(evaluate(first, env)) ? evaluate(args[1]!, env) : evaluate(args[2]!, env);
  }

  const values = args.map((arg) => evaluate(arg, env));

  switch (name) {
    case "ROUND":
      return guard(num(values[0]!).toDecimalPlaces(digits(values[1]), ROUND_HALF_UP));
    case "FLOOR":
      return guard(num(values[0]!).toDecimalPlaces(digits(values[1]), ROUND_FLOOR));
    case "CEIL":
      return guard(num(values[0]!).toDecimalPlaces(digits(values[1]), ROUND_CEIL));
    case "ABS":
      return num(values[0]!).abs();
    case "MIN":
      return D.min(...values.map(num));
    case "MAX":
      return D.max(...values.map(num));
    case "SUM":
      return guard(values.reduce<Dec>((sum, v) => guard(sum.plus(num(v))), new D(0)));
    case "AVG":
      return guard(
        values.reduce<Dec>((sum, v) => guard(sum.plus(num(v))), new D(0)).div(values.length),
      );
    case "CONCAT": {
      const joined = values.map(asText).join("");

      if (joined.length > FORMULA_LIMITS.maxResultTextLength) throw new EvalError("OVERFLOW");

      return joined;
    }
    case "UPPER":
      return text(values[0]!).toUpperCase();
    case "LOWER":
      return text(values[0]!).toLowerCase();
    default:
      throw new EvalError("INVALID_FORMULA");
  }
};

const evaluate = (node: FormulaNode, env: EvalEnv): Value => {
  switch (node.kind) {
    case "num":
      return new D(node.value);
    case "str":
      return node.value;
    case "bool":
      return node.value;
    case "ref":
      return ref(node, env);
    case "unary":
      return node.op === "-" ? num(evaluate(node.arg, env)).neg() : !bool(evaluate(node.arg, env));
    case "call":
      return call(node, env);
    case "binary": {
      // AND / OR stop early, like IF.
      if (node.op === "AND")
        return bool(evaluate(node.left, env)) && bool(evaluate(node.right, env));
      if (node.op === "OR")
        return bool(evaluate(node.left, env)) || bool(evaluate(node.right, env));

      const left = evaluate(node.left, env);
      const right = evaluate(node.right, env);

      if (node.op === "=" || node.op === "!=") {
        const equal = D.isDecimal(left) && D.isDecimal(right) ? left.eq(right) : left === right;

        return node.op === "=" ? equal : !equal;
      }

      const a = num(left);
      const b = num(right);

      switch (node.op) {
        case "+":
          return guard(a.plus(b));
        case "-":
          return guard(a.minus(b));
        case "*":
          return guard(a.times(b));
        case "/":
          if (b.isZero()) throw new EvalError("DIVISION_BY_ZERO");
          return guard(a.div(b));
        case "%":
          if (b.isZero()) throw new EvalError("DIVISION_BY_ZERO");
          return guard(a.mod(b));
        case "<":
          return a.lt(b);
        case "<=":
          return a.lte(b);
        case ">":
          return a.gt(b);
        case ">=":
          return a.gte(b);
        default:
          throw new EvalError("INVALID_FORMULA");
      }
    }
  }
};

export type EvalResult = { ok: true; value: CalcValue } | { ok: false; code: EvalErrorCode };

/**
 * Evaluates a checked formula and turns the result into what is stored: a number rounded to
 * `decimals` (half away from zero, default 2), a string or a boolean. A failure (division by zero,
 * an empty input with `emptyAsZero: false`, overflow) is a result with a code, not an exception.
 */
export const evaluateFormula = (
  ast: FormulaNode,
  env: EvalEnv,
  config: Pick<CalculationConfig, "resultType" | "decimals">,
): EvalResult => {
  try {
    const value = evaluate(ast, env);

    if (D.isDecimal(value)) {
      if (config.resultType !== "number") return { ok: false, code: "INVALID_FORMULA" };

      const rounded = value.toDecimalPlaces(
        config.decimals ?? FORMULA_LIMITS.defaultDecimals,
        ROUND_HALF_UP,
      );

      if (rounded.abs().gte(MAX_RESULT) || rounded.sd() > MAX_RESULT_DIGITS)
        throw new EvalError("OVERFLOW");

      // `|| 0` turns -0 into 0.
      return { ok: true, value: Number(rounded.toFixed()) || 0 };
    }

    if (typeof value !== config.resultType) return { ok: false, code: "INVALID_FORMULA" };

    return { ok: true, value };
  } catch (error) {
    if (error instanceof EvalError) return { ok: false, code: error.code };

    throw error;
  }
};

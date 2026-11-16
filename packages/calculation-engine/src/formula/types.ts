import type { CalculationResultType, QuestionConfig, QuestionType } from "@quorvia/shared-types";

// ---- Limits (see docs/calculation.md) ---------------------------------------------------------

export const FORMULA_LIMITS = {
  maxLength: 500,
  maxNodes: 200,
  maxDepth: 20,
  maxStringLength: 200,
  maxNumberLength: 30,
  maxResultTextLength: 1000,
  maxDecimals: 8,
  defaultDecimals: 2,
} as const;

// ---- AST --------------------------------------------------------------------------------------

export type BinaryOp =
  "+" | "-" | "*" | "/" | "%" | "=" | "!=" | "<" | "<=" | ">" | ">=" | "AND" | "OR";
export type UnaryOp = "-" | "NOT";

interface Base {
  // Offset of the node's first character in the formula text (for error positions in the editor).
  pos: number;
  end: number;
}

export type FormulaNode =
  // The literal stays a string so no precision is lost before the Decimal is built.
  | (Base & { kind: "num"; value: string })
  | (Base & { kind: "str"; value: string })
  | (Base & { kind: "bool"; value: boolean })
  | (Base & { kind: "ref"; id: string })
  | (Base & { kind: "unary"; op: UnaryOp; arg: FormulaNode })
  | (Base & { kind: "binary"; op: BinaryOp; left: FormulaNode; right: FormulaNode })
  | (Base & { kind: "call"; name: string; args: FormulaNode[] });

// ---- Errors -----------------------------------------------------------------------------------

// Problems found when a formula is saved or edited (syntax, types, references, limits, cycles).
export const FORMULA_ERROR_CODES = [
  "EMPTY_FORMULA",
  "FORMULA_TOO_LONG",
  "TOO_MANY_NODES",
  "DEPTH_LIMIT",
  "UNEXPECTED_CHARACTER",
  "UNEXPECTED_TOKEN",
  "UNEXPECTED_END",
  "BAD_NUMBER",
  "BAD_STRING",
  "BAD_REFERENCE",
  "UNKNOWN_IDENTIFIER",
  "UNKNOWN_FUNCTION",
  "ARITY",
  "TYPE_MISMATCH",
  "UNKNOWN_REFERENCE",
  "UNSUPPORTED_REFERENCE",
  "INVALID_CONFIG",
  "FORMULA_CYCLE",
  "HIDDEN_REFERENCE",
] as const;

export type FormulaErrorCode = (typeof FORMULA_ERROR_CODES)[number];

// Why a value could not be computed for one response. The field then shows "-" (value null) and
// submitting is never blocked.
export const EVAL_ERROR_CODES = [
  "DIVISION_BY_ZERO",
  "OVERFLOW",
  "EMPTY_REFERENCE",
  "INVALID_ARGUMENT",
  "INVALID_FORMULA",
] as const;

export type EvalErrorCode = (typeof EVAL_ERROR_CODES)[number];

export interface FormulaDiagnostic {
  code: FormulaErrorCode;
  message: string;
  pos: number;
  end: number;
}

export class FormulaError extends Error {
  constructor(
    readonly code: FormulaErrorCode,
    message: string,
    readonly pos: number,
    readonly end: number = pos + 1,
  ) {
    super(message);
  }

  toDiagnostic(): FormulaDiagnostic {
    return { code: this.code, message: this.message, pos: this.pos, end: this.end };
  }
}

export class EvalError extends Error {
  constructor(readonly code: EvalErrorCode) {
    super(code);
  }
}

// ---- Questions as the engine sees them ---------------------------------------------------------

// The result types of a calculation field are the formula types (shared-types names them).
export type FormulaType = CalculationResultType;

// A calculation field's configuration with the parts the engine needs present.
export interface CalculationConfig extends QuestionConfig {
  formula: string;
  resultType: FormulaType;
}

export interface FormulaQuestion {
  id: string;
  type: QuestionType;
  options?: readonly { id: string; text?: string; score?: number | null }[] | null;
  config?: QuestionConfig | null;
}

// A computed value as stored in `answers`.
export type CalcValue = number | string | boolean;

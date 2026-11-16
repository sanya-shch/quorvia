import {
  collectRefs,
  computeCalculations,
  formatCalcValue,
  NO_VALUE,
  parseFormula,
  validateCalculations,
  type CalcValue,
  type FormulaIssue,
  type FormulaQuestion,
} from "@quorvia/calculation-engine";
import {
  CALCULATION_LIMITS,
  ErrorCode,
  type QuestionConfig,
  type QuestionType,
} from "@quorvia/shared-types";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { stripQuestionScoring } from "./form.scoring.js";

// Calculation fields on the server (docs/calculation.md). The formula engine is shared with the
// builder and the viewer; the server is the one that decides what is stored.

interface StoredQuestion {
  id: string;
  type: QuestionType;
  options?: unknown;
  config?: unknown;
  condition?: unknown;
}

// A stored question as the engine wants it. The options and the config are Json: the engine copes
// with whatever shape they have, so nothing is trusted beyond the type.
const toFormulaQuestion = (question: StoredQuestion): FormulaQuestion => ({
  id: question.id,
  type: question.type,
  options: Array.isArray(question.options)
    ? (question.options as { id: string; text?: string; score?: number | null }[])
    : null,
  config:
    question.config && typeof question.config === "object" && !Array.isArray(question.config)
      ? (question.config as QuestionConfig)
      : null,
});

export type CalculationIssue =
  | FormulaIssue
  | {
      questionId: string;
      code: "TOO_MANY_CALCULATIONS";
      message: string;
      pos: number;
      end: number;
    };

// Everything wrong with the calculation fields of the question list a form is being saved with:
// a formula that does not parse or type-check, a question that no longer exists (this is also what
// stops a question from being deleted while a formula still reads it), a circle, a visible field
// reading a hidden one, too many fields.
export const findCalculationIssues = (questions: readonly StoredQuestion[]): CalculationIssue[] => {
  const issues: CalculationIssue[] = validateCalculations(questions.map(toFormulaQuestion));
  const calculations = questions.filter((q) => q.type === "CALCULATION");

  if (calculations.length > CALCULATION_LIMITS.perForm) {
    issues.push({
      questionId: calculations[CALCULATION_LIMITS.perForm]!.id,
      code: "TOO_MANY_CALCULATIONS",
      message: `A form has at most ${CALCULATION_LIMITS.perForm} calculation fields.`,
      pos: 0,
      end: 0,
    });
  }

  return issues;
};

export const assertCalculationsValid = (questions: readonly StoredQuestion[]): void => {
  const issues = findCalculationIssues(questions);

  if (issues.length > 0) {
    throw new AppError(ErrorCode.FORM_INVALID_FORMULAS, 400, issues);
  }
};

// A question's own condition decides whether it is shown, and a computed value depends on what was
// shown: it must not look at one (the same reason it cannot look at $score). Returned in the shape
// of the condition graph errors, so they travel as FORM_INVALID_CONDITIONS.
export const findCalculationConditionErrors = (
  questions: readonly { id: string; type: QuestionType; condition?: unknown }[],
): { questionId: string; reason: "CALCULATION_REFERENCE"; detail: string }[] => {
  const calculationIds = new Set(
    questions.filter((q) => q.type === "CALCULATION").map((q) => q.id),
  );

  if (calculationIds.size === 0) return [];

  return questions.flatMap((q) => {
    const rules = (q.condition as { rules?: { questionId?: unknown }[] } | null | undefined)?.rules;

    return (rules ?? []).some(
      (r) => typeof r.questionId === "string" && calculationIds.has(r.questionId),
    )
      ? [
          {
            questionId: q.id,
            reason: "CALCULATION_REFERENCE" as const,
            detail: `Question ${q.id} cannot depend on a calculation field`,
          },
        ]
      : [];
  });
};

// The questions a respondent receives. A calculation that is hidden from the respondent is left out
// completely (its formula, thresholds and all, stays on the server). The points of a question that a
// visible formula reads are kept: the viewer needs the price of an option to show the total as it
// changes; every other question loses its points (see stripQuestionScoring).
export const toPublicQuestions = <T extends StoredQuestion>(questions: readonly T[]): T[] => {
  const readByVisible = new Set<string>();

  for (const q of questions) {
    const config = toFormulaQuestion(q).config;

    if (q.type !== "CALCULATION" || config?.display === "hidden" || !config?.formula) continue;

    const parsed = parseFormula(config.formula);

    if (parsed.ok) for (const id of collectRefs(parsed.ast)) readByVisible.add(id);
  }

  return questions
    .filter((q) => !(q.type === "CALCULATION" && toFormulaQuestion(q).config?.display === "hidden"))
    .map((q) => (readByVisible.has(q.id) ? keepPointsOnly(q) : stripQuestionScoring(q)));
};

// Keeps the points but not the multiplier of a NUMBER (a formula reads the number itself).
const keepPointsOnly = <T extends StoredQuestion>(question: T): T => {
  const { config } = question;

  if (!config || typeof config !== "object" || Array.isArray(config)) return question;

  const { scoreMultiplier: _multiplier, ...rest } = config as Record<string, unknown>;

  return { ...question, config: rest };
};

export interface CalculatedSubmission {
  // The answers plus the computed values (a value that could not be computed is left out).
  answers: Record<string, unknown>;
  // questionId -> stored value, only the ones that could be computed.
  values: Record<string, CalcValue>;
}

// Computes every calculation field from the answers the server accepted. The client never sends
// these values; whatever it sent was dropped before (cleanAnswers).
export const calculateSubmission = (
  questions: readonly StoredQuestion[],
  answers: Record<string, unknown>,
  visibleQuestionIds: ReadonlySet<string>,
): CalculatedSubmission => {
  if (!questions.some((q) => q.type === "CALCULATION")) return { answers, values: {} };

  const computed = computeCalculations(
    questions.map(toFormulaQuestion),
    answers,
    visibleQuestionIds,
  );
  const values: Record<string, CalcValue> = {};

  for (const [id, value] of Object.entries(computed.values)) {
    if (value !== null) values[id] = value;
  }

  return { answers: { ...answers, ...values }, values };
};

const PLACEHOLDER = /\{\{\s*calc:([A-Za-z0-9_-]{1,64})\s*\}\}/g;

/**
 * Puts the computed values into the text of an end screen: `{{calc:<question id>}}` becomes the
 * value as the field shows it (prefix, decimals, suffix). A field that has no value (hidden, or it
 * failed) becomes a dash. Plain text replacement on the server, like the score placeholders.
 */
export const fillCalculationPlaceholders = (
  text: string,
  questions: readonly StoredQuestion[],
  values: Readonly<Record<string, CalcValue>>,
  locale: string | null,
): string => {
  if (!text.includes("{{")) return text;

  return text.replace(PLACEHOLDER, (_match, id: string) => {
    const question = questions.find((q) => q.id === id && q.type === "CALCULATION");
    const config = question ? toFormulaQuestion(question).config : null;
    const value = Object.prototype.hasOwnProperty.call(values, id) ? values[id] : undefined;

    return config?.resultType
      ? formatCalcValue(value, { ...config, resultType: config.resultType }, locale)
      : NO_VALUE;
  });
};

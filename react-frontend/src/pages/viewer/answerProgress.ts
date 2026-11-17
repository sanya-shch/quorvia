import { ErrorCode } from "@quorvia/shared-types";
import type { Question } from "../../types/formBuilder";
import type { AnswerValue, FormAnswers } from "../../types/formViewer";
import { toMatrixAnswer } from "./matrixAnswer";
import type { FieldValidationError } from "./questionValidation";

// Whether the respondent has put anything into the answer. A switch (BOOLEAN) always holds a value,
// and a calculation is computed, so neither is ever "missing".
export const isAnswered = (question: Question, value: AnswerValue | undefined): boolean => {
  if (question.type === "CALCULATION") return true;
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;

  return Object.keys(toMatrixAnswer(value)).length > 0;
};

export interface AnswerProgress {
  answered: number;
  total: number;
  // 0-100, for the progress bar.
  percent: number;
}

// "8 of 11 questions answered". Calculations are not counted: the respondent does not answer them.
export const getAnswerProgress = (questions: Question[], answers: FormAnswers): AnswerProgress => {
  const countable = questions.filter((q) => q.type !== "CALCULATION");
  const answered = countable.filter((q) => isAnswered(q, answers[q.id ?? ""])).length;

  return {
    answered,
    total: countable.length,
    percent: countable.length === 0 ? 0 : Math.round((answered / countable.length) * 100),
  };
};

const REQUIRED_KEY = `errors.${ErrorCode.VALIDATION_FIELD_REQUIRED}`;

// How many required questions are still empty, out of a validateAll() result (other kinds of
// errors, such as a wrong e-mail format, are not "missing" answers).
export const countMissingRequired = (errors: Record<string, FieldValidationError>): number =>
  Object.values(errors).filter((error) => error.key === REQUIRED_KEY).length;

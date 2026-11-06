import { type Question } from "../../types/formBuilder";
import { type AnswerValue } from "../../types/formViewer";
import { toMatrixAnswer } from "./matrixAnswer";
import {
  assertNever,
  ErrorCode,
  isOtherSelected,
  otherAnswerKey,
} from "@quorvia/shared-types";

/**
 * The validation result is NOT display text but an i18next translation key (+ interpolation
 * params such as {{min}}); translation happens in the display component (QuestionField.tsx)
 * via t(error.key, error.params). This function is a pure synchronous utility with no access
 * to React context (and so to the selected language), so it physically cannot return an
 * already translated string.
 */
export type FieldValidationError = { key: string; params?: Record<string, unknown> };

/**
 * Validation of a single answer field, separate from FormViewer so the same rules (required,
 * min/max length, email/name regex, custom pattern, number min/max) work identically in the
 * "all questions on one page" mode (FormViewer) and the "one question at a time" mode
 * (QuestionStepper). Duplicating them in two places would sooner or later drift apart (for
 * example the email regex fixed in one place and forgotten in the other).
 */
export const validateField = (
  q: Question,
  value: AnswerValue,
  // The "Other" text (answers[otherAnswerKey(id)]) is only needed by choice questions.
  otherText?: AnswerValue,
): FieldValidationError | null => {
  const isEmptyText = typeof value === "string" && value.trim() === "";
  const isEmptyArray = Array.isArray(value) && value.length === 0;
  const isUndefinedOrNull = value === undefined || value === null || value === "";
  const isEmptyMatrix = q.type === "MATRIX" && Object.keys(toMatrixAnswer(value)).length === 0;
  const isEmpty = isEmptyText || isEmptyArray || isUndefinedOrNull || isEmptyMatrix;

  if (q.required && isEmpty) {
    return { key: `errors.${ErrorCode.VALIDATION_FIELD_REQUIRED}` };
  }

  if (isEmpty) return null;

  // A required matrix needs every row filled (an optional one, any part).
  if (q.type === "MATRIX" && q.required) {
    const cells = toMatrixAnswer(value);

    if ((q.config?.rows ?? []).some((row) => cells[row.id] === undefined)) {
      return { key: `errors.${ErrorCode.VALIDATION_FIELD_REQUIRED}` };
    }
  }

  // "Other" selected without text is an empty answer, even if the question is optional.
  if (isOtherSelected(q.type, q.options, value)) {
    const text = typeof otherText === "string" ? otherText.trim() : "";

    if (text === "") return { key: `errors.${ErrorCode.VALIDATION_FIELD_REQUIRED}` };
  }

  if (q.type === "NUMBER" && typeof value === "number") {
    if (q.config?.min !== undefined && value < q.config.min)
      return { key: "viewer.validation.numberMin", params: { min: q.config.min } };
    if (q.config?.max !== undefined && value > q.config.max)
      return { key: "viewer.validation.numberMax", params: { max: q.config.max } };
  }

  if (q.type === "TEXT" && typeof value === "string") {
    const trimmedValue = value.trim();

    if (q.config?.minLength !== undefined && trimmedValue.length < q.config.minLength) {
      return {
        key: "viewer.validation.textMinLength",
        params: { minLength: q.config.minLength },
      };
    }
    if (q.config?.maxLength !== undefined && trimmedValue.length > q.config.maxLength) {
      return {
        key: "viewer.validation.textMaxLength",
        params: { maxLength: q.config.maxLength },
      };
    }

    if (q.config?.variant === "email") {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(trimmedValue)) {
        return { key: `errors.${ErrorCode.VALIDATION_EMAIL_INVALID}` };
      }
    }

    if (q.config?.variant === "name") {
      const nameRegex = /^[a-zA-Zа-яА-ЯіІїЇєЄґҐ\s'\u2019\u02BC-]+$/;
      if (!nameRegex.test(trimmedValue)) {
        return { key: "viewer.validation.nameInvalid" };
      }
    }

    if (q.config?.pattern) {
      const regex = new RegExp(q.config.pattern);
      if (!regex.test(trimmedValue)) {
        return { key: `errors.${ErrorCode.VALIDATION_FORMAT_INVALID}` };
      }
    }
  }

  return null;
};

export const getDefaultAnswer = (q: Question): AnswerValue => {
  switch (q.type) {
    case "BOOLEAN":
      return q.config?.defaultValue ?? false;
    case "CHOICE_SINGLE": {
      const defaultOpt = q.options?.find((o) => o.isDefault);
      return defaultOpt ? defaultOpt.id : "";
    }
    case "CHOICE_MULTI":
      return q.options?.filter((o) => o.isDefault).map((o) => o.id) || [];
    case "TEXT":
    case "NUMBER":
    case "DATE":
    case "RATING":
    case "SCALE":
    case "NPS":
    case "RANKING":
    case "MATRIX":
      // Ranking and matrix have no answer until the respondent interacts.
      return "";
    default:
      return assertNever(q.type, "question type");
  }
};

// Validates a set of questions (visible ones by default) and returns a questionId -> translation key error map.
export const validateAll = (
  questions: Question[],
  answers: Record<string, AnswerValue>,
): Record<string, FieldValidationError> => {
  const errors: Record<string, FieldValidationError> = {};
  questions.forEach((q, index) => {
    const qId = q.id || `q-${index}`;
    const error = validateField(q, answers[qId], answers[otherAnswerKey(qId)]);
    if (error) errors[qId] = error;
  });
  return errors;
};

/**
 * Builds the submit payload: skips empty optional fields and keeps only the questions from
 * the given list (visible/reached by default). The same final cleanup as submitResponse on
 * the backend, but here it is for a clean request, not for security (the server checks
 * visibility on its own anyway).
 */
export const buildCleanedAnswers = (
  questions: Question[],
  answers: Record<string, AnswerValue>,
): Record<string, AnswerValue> => {
  const cleaned: Record<string, AnswerValue> = {};
  questions.forEach((question) => {
    const qId = question.id;
    if (!qId) return;

    const value = answers[qId];
    const isEmptyText = typeof value === "string" && value.trim() === "";
    const isEmptyArray = Array.isArray(value) && value.length === 0;
    const isUndefinedOrNull = value === undefined || value === null || value === "";
    const isEmptyMatrix = question.type === "MATRIX" && Object.keys(toMatrixAnswer(value)).length === 0;

    if (!question.required && (isEmptyText || isEmptyArray || isUndefinedOrNull || isEmptyMatrix)) {
      return;
    }

    cleaned[qId] = value;

    // The "Other" text only while it is currently selected (stale text after changing the choice is not sent).
    if (isOtherSelected(question.type, question.options, value)) {
      const text = answers[otherAnswerKey(qId)];
      cleaned[otherAnswerKey(qId)] = typeof text === "string" ? text.trim() : "";
    }
  });
  return cleaned;
};

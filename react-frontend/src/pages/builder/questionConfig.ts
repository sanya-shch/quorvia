import { assertNever, MATRIX_LIMITS, RANKING_LIMITS, SCALE_LIMITS } from "@quorvia/shared-types";
import type { QuestionConfig, QuestionOption, QuestionType } from "../../types/formBuilder";

// Default config of a new question. A switch without default: a new question type does not
// compile until it is explicitly decided which config it gets.
export const createDefaultQuestionConfig = (
  type: QuestionType,
  // Label of a new matrix row (needed only for MATRIX).
  rowLabel: (number: number) => string = (number) => `Row ${number}`,
): QuestionConfig | null => {
  switch (type) {
    case "CHOICE_SINGLE":
    case "CHOICE_MULTI":
      return { displayVariant: "list" };
    case "TEXT":
      return { variant: "input" };
    case "BOOLEAN":
      return { defaultValue: false };
    case "RATING":
      return { max: SCALE_LIMITS.ratingMax.default };
    case "SCALE":
      return { min: SCALE_LIMITS.scaleStart.default, max: SCALE_LIMITS.scaleEnd.default };
    case "NUMBER":
    case "DATE":
    case "NPS":
    case "RANKING":
      return null;
    case "MATRIX":
      return { rows: [{ id: `row-${Date.now()}-0`, text: rowLabel(1) }] };
    default:
      return assertNever(type, "question type");
  }
};

// Whether the question has an options list; for the other types options is an empty array.
export const questionTypeUsesOptions = (type: QuestionType): boolean => {
  switch (type) {
    case "CHOICE_SINGLE":
    case "CHOICE_MULTI":
    case "RANKING":
    case "MATRIX": // the matrix options are its columns
      return true;
    case "TEXT":
    case "NUMBER":
    case "BOOLEAN":
    case "DATE":
    case "RATING":
    case "SCALE":
    case "NPS":
      return false;
    default:
      return assertNever(type, "question type");
  }
};

// Options of a new question. One for choice, the minimum allowed count for ranking (otherwise
// the form would not save).
export const createDefaultOptions = (
  type: QuestionType,
  label: (number: number) => string,
): QuestionOption[] => {
  if (!questionTypeUsesOptions(type)) return [];

  const count =
    type === "RANKING"
      ? RANKING_LIMITS.minOptions
      : type === "MATRIX"
        ? MATRIX_LIMITS.minColumns
        : 1;
  const stamp = Date.now();

  return Array.from({ length: count }, (_, i) => ({
    id: `opt-${stamp}-${i}`,
    text: label(i + 1),
    isDefault: false,
  }));
};

// Whether the answer can be used in conditions that show other questions. Ranking and matrix
// are not supported: an order array / a row -> column object does not reduce to simple
// operators (equals/gt/...).
export const questionTypeSupportsConditions = (type: QuestionType): boolean => {
  switch (type) {
    case "TEXT":
    case "NUMBER":
    case "CHOICE_SINGLE":
    case "CHOICE_MULTI":
    case "BOOLEAN":
    case "DATE":
    case "RATING":
    case "SCALE":
    case "NPS":
      return true;
    case "RANKING":
    case "MATRIX":
      return false;
    default:
      return assertNever(type, "question type");
  }
};

// Whether the question type stores config on the server. For the other types null is sent on
// save so no config of a previous type stays in the DB.
export const questionTypeUsesConfig = (type: QuestionType): boolean => {
  switch (type) {
    case "TEXT":
    case "NUMBER":
    case "CHOICE_SINGLE":
    case "CHOICE_MULTI":
    case "BOOLEAN":
    case "RATING":
    case "SCALE":
    case "MATRIX": // config.rows
      return true;
    case "DATE":
    case "NPS":
    case "RANKING":
      return false;
    default:
      return assertNever(type, "question type");
  }
};

import { assertNever, getOtherOption } from "@quorvia/shared-types";
import type { Question } from "../../types/formBuilder";
import type { AnswerValue } from "../../types/formViewer";
import { toMatrixAnswer } from "./matrixAnswer";

interface ReviewLabels {
  yes: string;
  no: string;
  // Shown when the question was not answered.
  empty: string;
}

// The answer as text for the "Review your answers" screen (step-by-step mode). It used to be
// `value.toString()`: options showed as ids, booleans as "true" and a matrix answer object as
// "[object Object]".
export const formatReviewAnswer = (
  question: Question,
  value: AnswerValue | undefined,
  otherText: AnswerValue | undefined,
  labels: ReviewLabels,
): string => {
  const textOf = (id: string): string => {
    const option = question.options.find((o) => o.id === id);
    if (!option) return id;

    const other = getOtherOption(question.options);
    const custom = typeof otherText === "string" ? otherText.trim() : "";

    return other?.id === option.id && custom ? `${option.text}: ${custom}` : option.text;
  };

  switch (question.type) {
    case "TEXT":
    case "NUMBER":
    case "DATE":
    case "RATING":
    case "SCALE":
    case "NPS":
      return value === undefined || value === "" ? labels.empty : String(value);

    case "BOOLEAN":
      return value === undefined || value === "" ? labels.empty : value ? labels.yes : labels.no;

    case "CHOICE_SINGLE":
      return typeof value === "string" && value ? textOf(value) : labels.empty;

    case "CHOICE_MULTI":
      return Array.isArray(value) && value.length > 0 ? value.map(textOf).join(", ") : labels.empty;

    case "RANKING":
      return Array.isArray(value) && value.length > 0
        ? value.map((id, index) => `${index + 1}. ${textOf(id)}`).join("; ")
        : labels.empty;

    case "MATRIX": {
      const cells = toMatrixAnswer(value);
      const parts = (question.config?.rows ?? [])
        .filter((row) => cells[row.id] !== undefined)
        .map((row) => `${row.text}: ${textOf(cells[row.id])}`);

      return parts.length > 0 ? parts.join("; ") : labels.empty;
    }

    default:
      return assertNever(question.type, "question type");
  }
};

import { formatCalcValue } from "@quorvia/calculation-engine";
import { assertNever, getOtherOption } from "@quorvia/shared-types";
import type { Question } from "../../types/formBuilder";
import type { AnswerValue } from "../../types/formViewer";
import { toMatrixAnswer } from "./matrixAnswer";

interface ReviewLabels {
  yes: string;
  no: string;
  // Shown when the question was not answered.
  empty: string;
  // FILE answers hold file ids; this turns an id into the name the respondent saw.
  fileName?: (id: string) => string | undefined;
  // The language numbers of a calculation are written in.
  locale?: string;
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
    case "IMAGE_CHOICE":
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

    case "FILE": {
      const names = Array.isArray(value) ? value.map((id) => labels.fileName?.(id) ?? id) : [];

      return names.length > 0 ? names.join(", ") : labels.empty;
    }

    // The computed value, as the field showed it (`value` is the computed one; none: a dash).
    case "CALCULATION":
      return formatCalcValue(
        typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? value
          : null,
        {
          resultType: question.config?.resultType ?? "number",
          decimals: question.config?.decimals,
          prefix: question.config?.prefix,
          suffix: question.config?.suffix,
        },
        labels.locale,
      );

    default:
      return assertNever(question.type, "question type");
  }
};

import type { AnswerValue, MatrixAnswerValue } from "../../types/formViewer";

/** Відповідь матриці як об'єкт { rowId: columnId } (порожній об'єкт, якщо відповіді ще немає). */
export const toMatrixAnswer = (value: AnswerValue | undefined): MatrixAnswerValue =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};

import type { AnswerValue, MatrixAnswerValue } from "../../types/formViewer";

// A matrix answer as an { rowId: columnId } object (an empty object when there is no answer yet).
export const toMatrixAnswer = (value: AnswerValue | undefined): MatrixAnswerValue =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};

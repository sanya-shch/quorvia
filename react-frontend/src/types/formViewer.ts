export interface FormResponsePayload {
  formId: string;
  responses: {
    questionId: string;
    value: AnswerValue;
  }[];
}

// MATRIX: { [rowId]: columnId }, one column per row.
export type MatrixAnswerValue = Record<string, string>;

export type AnswerValue = string | number | boolean | string[] | MatrixAnswerValue;

export type FormAnswers = Record<string, AnswerValue>;

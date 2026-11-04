export interface FormResponsePayload {
  formId: string;
  responses: {
    questionId: string;
    value: AnswerValue;
  }[];
}

/** MATRIX: { [rowId]: columnId } - по одній колонці на рядок. */
export type MatrixAnswerValue = Record<string, string>;

export type AnswerValue = string | number | boolean | string[] | MatrixAnswerValue;

export type FormAnswers = Record<string, AnswerValue>;

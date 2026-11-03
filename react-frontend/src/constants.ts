import type { QuestionType } from "./types/formBuilder";

/**
 * Значення - ключі i18next (react-frontend/src/i18n/locales/{uk,en}/builder.json,
 * секція questionTypes), а НЕ готовий текст - переклад відбувається в
 * місці показу через t(QUESTION_TYPE_LABEL_KEYS[type]).
 */
export const QUESTION_TYPE_LABEL_KEYS: Record<QuestionType, string> = {
  TEXT: "builder.questionTypes.TEXT",
  NUMBER: "builder.questionTypes.NUMBER",
  CHOICE_SINGLE: "builder.questionTypes.CHOICE_SINGLE",
  CHOICE_MULTI: "builder.questionTypes.CHOICE_MULTI",
  BOOLEAN: "builder.questionTypes.BOOLEAN",
  DATE: "builder.questionTypes.DATE",
  RATING: "builder.questionTypes.RATING",
  SCALE: "builder.questionTypes.SCALE",
  NPS: "builder.questionTypes.NPS",
  RANKING: "builder.questionTypes.RANKING",
} as const;

import type { QuestionType } from "./types/formBuilder";

// Values are i18next keys (react-frontend/src/i18n/locales/{uk,en}/builder.json, the questionTypes
// section), NOT display text; the translation happens where shown, via
// t(QUESTION_TYPE_LABEL_KEYS[type]).
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
  MATRIX: "builder.questionTypes.MATRIX",
} as const;

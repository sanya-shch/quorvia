import { assertNever, SCALE_LIMITS } from "@quorvia/shared-types";
import type { QuestionConfig, QuestionType } from "../../types/formBuilder";

/**
 * Типовий config нового питання. switch без default: новий тип питання
 * не скомпілюється, поки для нього явно не вирішено, який config він має.
 */
export const createDefaultQuestionConfig = (type: QuestionType): QuestionConfig | null => {
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
      return null;
    default:
      return assertNever(type, "question type");
  }
};

/**
 * Чи зберігає тип питання config на сервері. Для решти типів при збереженні
 * шлемо null, щоб у БД не залишався config від попереднього типу.
 */
export const questionTypeUsesConfig = (type: QuestionType): boolean => {
  switch (type) {
    case "TEXT":
    case "NUMBER":
    case "CHOICE_SINGLE":
    case "CHOICE_MULTI":
    case "BOOLEAN":
    case "RATING":
    case "SCALE":
      return true;
    case "DATE":
    case "NPS":
      return false;
    default:
      return assertNever(type, "question type");
  }
};

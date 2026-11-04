import { assertNever, MATRIX_LIMITS, RANKING_LIMITS, SCALE_LIMITS } from "@quorvia/shared-types";
import type { QuestionConfig, QuestionOption, QuestionType } from "../../types/formBuilder";

/**
 * Типовий config нового питання. switch без default: новий тип питання
 * не скомпілюється, поки для нього явно не вирішено, який config він має.
 */
export const createDefaultQuestionConfig = (
  type: QuestionType,
  /** Підпис нового рядка матриці (потрібен лише для MATRIX). */
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

/** Чи має питання список варіантів (options); для решти типів options - порожній масив. */
export const questionTypeUsesOptions = (type: QuestionType): boolean => {
  switch (type) {
    case "CHOICE_SINGLE":
    case "CHOICE_MULTI":
    case "RANKING":
    case "MATRIX": // options матриці - її колонки
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

/**
 * Варіанти нового питання. Для вибору - один, для ранжування - мінімально
 * допустима кількість (інакше форма не збережеться).
 */
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

/**
 * Чи можна використовувати відповідь на питання в умовах показу інших питань.
 * Ранжування й матриця в умовах не підтримуються: масив порядку / об'єкт
 * рядок->колонка не зводяться до простих операторів (equals/gt/...).
 */
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

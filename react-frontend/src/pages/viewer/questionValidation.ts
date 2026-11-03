import { type Question } from "../../types/formBuilder";
import { type AnswerValue } from "../../types/formViewer";
import {
  assertNever,
  ErrorCode,
  isOtherSelected,
  otherAnswerKey,
} from "@quorvia/shared-types";

/**
 * Результат валідації - НЕ готовий текст, а ключ перекладу i18next (+
 * параметри для інтерполяції, напр. {{min}}) - переклад відбувається у
 * компоненті показу (QuestionField.tsx) через t(error.key, error.params).
 * Ця функція - чистий, синхронний utility без доступу до React-контексту
 * (і, відповідно, без доступу до поточної обраної мови), тому фізично не
 * може повернути вже перекладений рядок.
 */
export type FieldValidationError = { key: string; params?: Record<string, unknown> };

/**
 * Валідація одного поля відповіді - винесена окремо від FormViewer, щоб
 * той самий набір правил (required, min/max length, email/name regex,
 * кастомний pattern, min/max для чисел) однаково працював і в режимі
 * "усі питання на сторінці" (FormViewer), і в режимі "по одному питанню"
 * (QuestionStepper). Дублювання цих правил у двох місцях рано чи пізно
 * розійшлося б (наприклад, поправили regex email в одному, забули в іншому).
 */
export const validateField = (
  q: Question,
  value: AnswerValue,
  /** Текст варіанта «Інше» (answers[otherAnswerKey(id)]) - потрібен лише питанням із вибором. */
  otherText?: AnswerValue,
): FieldValidationError | null => {
  const isEmptyText = typeof value === "string" && value.trim() === "";
  const isEmptyArray = Array.isArray(value) && value.length === 0;
  const isUndefinedOrNull = value === undefined || value === null || value === "";
  const isEmpty = isEmptyText || isEmptyArray || isUndefinedOrNull;

  if (q.required && isEmpty) {
    return { key: `errors.${ErrorCode.VALIDATION_FIELD_REQUIRED}` };
  }

  if (isEmpty) return null;

  // Обране «Інше» без тексту - порожня відповідь, навіть якщо питання не обов'язкове.
  if (isOtherSelected(q.type, q.options, value)) {
    const text = typeof otherText === "string" ? otherText.trim() : "";

    if (text === "") return { key: `errors.${ErrorCode.VALIDATION_FIELD_REQUIRED}` };
  }

  if (q.type === "NUMBER" && typeof value === "number") {
    if (q.config?.min !== undefined && value < q.config.min)
      return { key: "viewer.validation.numberMin", params: { min: q.config.min } };
    if (q.config?.max !== undefined && value > q.config.max)
      return { key: "viewer.validation.numberMax", params: { max: q.config.max } };
  }

  if (q.type === "TEXT" && typeof value === "string") {
    const trimmedValue = value.trim();

    if (q.config?.minLength !== undefined && trimmedValue.length < q.config.minLength) {
      return {
        key: "viewer.validation.textMinLength",
        params: { minLength: q.config.minLength },
      };
    }
    if (q.config?.maxLength !== undefined && trimmedValue.length > q.config.maxLength) {
      return {
        key: "viewer.validation.textMaxLength",
        params: { maxLength: q.config.maxLength },
      };
    }

    if (q.config?.variant === "email") {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(trimmedValue)) {
        return { key: `errors.${ErrorCode.VALIDATION_EMAIL_INVALID}` };
      }
    }

    if (q.config?.variant === "name") {
      const nameRegex = /^[a-zA-Zа-яА-ЯіІїЇєЄґҐ\s'\u2019\u02BC-]+$/;
      if (!nameRegex.test(trimmedValue)) {
        return { key: "viewer.validation.nameInvalid" };
      }
    }

    if (q.config?.pattern) {
      const regex = new RegExp(q.config.pattern);
      if (!regex.test(trimmedValue)) {
        return { key: `errors.${ErrorCode.VALIDATION_FORMAT_INVALID}` };
      }
    }
  }

  return null;
};

export const getDefaultAnswer = (q: Question): AnswerValue => {
  switch (q.type) {
    case "BOOLEAN":
      return q.config?.defaultValue ?? false;
    case "CHOICE_SINGLE": {
      const defaultOpt = q.options?.find((o) => o.isDefault);
      return defaultOpt ? defaultOpt.id : "";
    }
    case "CHOICE_MULTI":
      return q.options?.filter((o) => o.isDefault).map((o) => o.id) || [];
    case "TEXT":
    case "NUMBER":
    case "DATE":
    case "RATING":
    case "SCALE":
    case "NPS":
    case "RANKING":
      // Ранжування - без відповіді, доки респондент не взаємодіяв зі списком.
      return "";
    default:
      return assertNever(q.type, "question type");
  }
};

/** Валідує набір питань (типово - лише видимі) і повертає мапу помилок questionId -> ключ перекладу. */
export const validateAll = (
  questions: Question[],
  answers: Record<string, AnswerValue>,
): Record<string, FieldValidationError> => {
  const errors: Record<string, FieldValidationError> = {};
  questions.forEach((q, index) => {
    const qId = q.id || `q-${index}`;
    const error = validateField(q, answers[qId], answers[otherAnswerKey(qId)]);
    if (error) errors[qId] = error;
  });
  return errors;
};

/**
 * Формує payload для відправки: пропускає порожні необов'язкові поля,
 * лишає тільки питання з переданого списку (типово - лише видимі/пройдені).
 * Той самий фінальний "cleanup", що й submitResponse на бекенді (Етап 2),
 * але тут - для чистоти запиту, а не для безпеки (сервер все одно
 * перевіряє видимість самостійно).
 */
export const buildCleanedAnswers = (
  questions: Question[],
  answers: Record<string, AnswerValue>,
): Record<string, AnswerValue> => {
  const cleaned: Record<string, AnswerValue> = {};
  questions.forEach((question) => {
    const qId = question.id;
    if (!qId) return;

    const value = answers[qId];
    const isEmptyText = typeof value === "string" && value.trim() === "";
    const isEmptyArray = Array.isArray(value) && value.length === 0;
    const isUndefinedOrNull = value === undefined || value === null || value === "";

    if (!question.required && (isEmptyText || isEmptyArray || isUndefinedOrNull)) {
      return;
    }

    cleaned[qId] = value;

    // Текст «Інше» - лише якщо воно зараз обране (старий текст після зміни вибору не шлемо).
    if (isOtherSelected(question.type, question.options, value)) {
      const text = answers[otherAnswerKey(qId)];
      cleaned[otherAnswerKey(qId)] = typeof text === "string" ? text.trim() : "";
    }
  });
  return cleaned;
};

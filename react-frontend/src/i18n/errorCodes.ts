import type { TFunction } from "i18next";
import axios from "axios";

/**
 * Бекенд повертає стабільний КОД помилки в полі `message` (напр.
 * "AUTH_INVALID_CREDENTIALS"), а не готовий текст - переклад тут, єдина
 * точка входу для показу помилки API користувачу. `defaultValue`
 * підстраховує на випадок, якщо бекенд віддасть код, для якого ще нема
 * перекладу (краще показати щось загальне, ніж сирий SCREAMING_SNAKE_CASE).
 */
export const translateErrorCode = (t: TFunction, code: string | undefined | null): string => {
  if (!code) {
    return t("errors.UNKNOWN");
  }

  return t(`errors.${code}`, { defaultValue: t("errors.UNKNOWN") });
};

/**
 * Дістає код помилки з будь-якої помилки axios-запиту (або невідомого
 * винятку) і одразу перекладає. Використовувати в кожному місці, де
 * ловимо `catch (error)` після виклику api/*.ts і показуємо текст
 * користувачу.
 */
export const getApiErrorMessage = (t: TFunction, error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const code = (error.response?.data as { message?: string } | undefined)?.message;
    return translateErrorCode(t, code);
  }

  return t("errors.UNKNOWN");
};

/**
 * Для RESPONSE_VALIDATION_FAILED (backend/src/modules/response/response.service.ts):
 * errors - масив { field, message }, де message теж є ErrorCode
 * (backend/src/modules/response/response.validation.ts).
 */
export type FieldError = { field: string; message: string };

export const getFieldErrorMessage = (t: TFunction, fieldError: FieldError): string =>
  translateErrorCode(t, fieldError.message);

/**
 * Для FORM_INVALID_CONDITIONS: errors - масив
 * { questionId, reason, detail } з @quorvia/condition-engine.
 * `reason` - стабільний код (SELF_REFERENCE / UNKNOWN_QUESTION / CYCLE /
 * FORWARD_REFERENCE), `detail` - лише для логів/дебагу, НЕ для показу.
 */
export type ConditionGraphError = { questionId: string; reason: string; detail?: string };

export const translateConditionError = (t: TFunction, error: ConditionGraphError): string =>
  t(`conditionErrors.${error.reason}`, {
    defaultValue: t("errors.FORM_INVALID_CONDITIONS"),
    questionId: error.questionId,
  });

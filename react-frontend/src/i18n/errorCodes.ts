import type { TFunction } from "i18next";
import axios from "axios";

/**
 * The backend returns a stable error CODE in `message` (for example "AUTH_INVALID_CREDENTIALS"),
 * not display text; the translation is here, the single entry point for showing an API error
 * to the user. `defaultValue` covers a code that has no translation yet (better to show
 * something generic than raw SCREAMING_SNAKE_CASE).
 */
export const translateErrorCode = (t: TFunction, code: string | undefined | null): string => {
  if (!code) {
    return t("errors.UNKNOWN");
  }

  return t(`errors.${code}`, { defaultValue: t("errors.UNKNOWN") });
};

// Extracts the error code from any axios error (or an unknown exception) and translates it
// right away. Use it everywhere a `catch (error)` after an api/*.ts call shows text to the user.
export const getApiErrorMessage = (t: TFunction, error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return translateErrorCode(t, getApiErrorCode(error));
  }

  return t("errors.UNKNOWN");
};

// The API error code (`message` of the response) without translation, for places where behavior
// depends on the code (for example FORM_VERSION_CONFLICT opens a dialog instead of just showing text).
export const getApiErrorCode = (error: unknown): string | undefined =>
  axios.isAxiosError(error)
    ? (error.response?.data as { message?: string } | undefined)?.message
    : undefined;

// For RESPONSE_VALIDATION_FAILED (backend/src/modules/response/response.service.ts): errors is
// an array of { field, message } where message is also an ErrorCode
// (backend/src/modules/response/response.validation.ts).
export type FieldError = { field: string; message: string };

export const getFieldErrorMessage = (t: TFunction, fieldError: FieldError): string =>
  translateErrorCode(t, fieldError.message);

// For FORM_INVALID_CONDITIONS: errors is an array of { questionId, reason, detail } from
// @quorvia/condition-engine. `reason` is a stable code (SELF_REFERENCE / UNKNOWN_QUESTION /
// CYCLE / FORWARD_REFERENCE); `detail` is only for logs/debugging, NOT for display.
export type ConditionGraphError = { questionId: string; reason: string; detail?: string };

export const translateConditionError = (t: TFunction, error: ConditionGraphError): string =>
  t(`conditionErrors.${error.reason}`, {
    defaultValue: t("errors.FORM_INVALID_CONDITIONS"),
    questionId: error.questionId,
  });

export const AUTH_EXPIRED_EVENT = "surveycraft:auth-expired";

/**
 * Стабільні коди помилок API - те, що бекенд кладе у поле `message` JSON-
 * відповіді для `AppError` (backend/src/shared/middleware/errorHandler.ts).
 * Це НЕ готовий для показу текст, а ідентифікатор - переклад у конкретну
 * мову відбувається на фронтенді через i18next
 * (react-frontend/src/i18n/errorCodes.ts, vue-analytics аналогічно).
 * Бекенд свідомо не знає жодної мови: додавання нової мови ніколи не
 * вимагає змін тут чи в backend/.
 */
export const ErrorCode = {
  AUTH_EMAIL_ALREADY_IN_USE: "AUTH_EMAIL_ALREADY_IN_USE",
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_REFRESH_TOKEN_MISSING: "AUTH_REFRESH_TOKEN_MISSING",
  AUTH_REFRESH_TOKEN_INVALID: "AUTH_REFRESH_TOKEN_INVALID",
  AUTH_UNAUTHORIZED: "AUTH_UNAUTHORIZED",
  AUTH_TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  AUTH_USER_NOT_FOUND: "AUTH_USER_NOT_FOUND",

  FORM_NOT_FOUND: "FORM_NOT_FOUND",
  FORM_FORBIDDEN: "FORM_FORBIDDEN",
  FORM_NOT_AVAILABLE: "FORM_NOT_AVAILABLE",
  FORM_NOT_PUBLISHED: "FORM_NOT_PUBLISHED",
  FORM_INVALID_CONDITIONS: "FORM_INVALID_CONDITIONS",
  FORM_QUESTION_ID_CONFLICT: "FORM_QUESTION_ID_CONFLICT",

  EXPORT_JOB_NOT_FOUND: "EXPORT_JOB_NOT_FOUND",
  EXPORT_NOT_READY: "EXPORT_NOT_READY",
  EXPORT_FILE_MISSING: "EXPORT_FILE_MISSING",

  RESPONSE_VALIDATION_FAILED: "RESPONSE_VALIDATION_FAILED",

  ANALYTICS_QUESTION_NOT_FOUND: "ANALYTICS_QUESTION_NOT_FOUND",
  ANALYTICS_UNSUPPORTED_TYPE: "ANALYTICS_UNSUPPORTED_TYPE",
  ANALYTICS_RESPONSE_NOT_FOUND: "ANALYTICS_RESPONSE_NOT_FOUND",

  VALIDATION_EMAIL_REQUIRED: "VALIDATION_EMAIL_REQUIRED",
  VALIDATION_EMAIL_INVALID: "VALIDATION_EMAIL_INVALID",
  VALIDATION_PASSWORD_REQUIRED: "VALIDATION_PASSWORD_REQUIRED",
  VALIDATION_PASSWORD_TOO_SHORT: "VALIDATION_PASSWORD_TOO_SHORT",
  VALIDATION_PASSWORD_NO_LOWERCASE: "VALIDATION_PASSWORD_NO_LOWERCASE",
  VALIDATION_PASSWORD_NO_UPPERCASE: "VALIDATION_PASSWORD_NO_UPPERCASE",
  VALIDATION_PASSWORD_NO_DIGIT: "VALIDATION_PASSWORD_NO_DIGIT",
  VALIDATION_PASSWORD_TOO_LONG: "VALIDATION_PASSWORD_TOO_LONG",
  VALIDATION_CONFIRM_PASSWORD_REQUIRED: "VALIDATION_CONFIRM_PASSWORD_REQUIRED",
  VALIDATION_PASSWORDS_DO_NOT_MATCH: "VALIDATION_PASSWORDS_DO_NOT_MATCH",

  VALIDATION_FIELD_REQUIRED: "VALIDATION_FIELD_REQUIRED",
  VALIDATION_FORMAT_INVALID: "VALIDATION_FORMAT_INVALID",
  VALIDATION_DATE_INVALID: "VALIDATION_DATE_INVALID",
  VALIDATION_MUST_BE_ACCEPTED: "VALIDATION_MUST_BE_ACCEPTED",

  REQUEST_BODY_INVALID: "REQUEST_BODY_INVALID",
  REQUEST_TOO_LARGE: "REQUEST_TOO_LARGE",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Мови, підтримувані в UI (React і Vue-модуль аналітики). Розширення
 * списку - додавання одного елемента тут + відповідних locale-файлів,
 * без змін логіки.
 */
export const SUPPORTED_LOCALES = ["uk", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

export type ResponseMode = "ALL_AT_ONCE" | "STEP_BY_STEP";

export type ConditionOperator = "equals" | "notEquals" | "contains" | "in" | "gt" | "lt";

export type ConditionValue = string | number | boolean | string[];

export interface ConditionRule {
  questionId: string;
  operator: ConditionOperator;
  value: ConditionValue;
}

export interface ConditionGroup {
  logic: "AND" | "OR";
  rules: ConditionRule[];
}

export interface QuestionVisibilityStats {
  shownCount: number;
  skippedCount: number;
  hiddenCount: number;
}

export interface TextPreview {
  value: string;
  count: number;
}

export interface NumberStats {
  avg: number;
  min: number;
  max: number;
}

export interface ChoiceDistribution {
  optionId: string;
  count: number;
  text: string;
}

export type QuestionAnalyticsType =
  | "TEXT"
  | "CHOICE_SINGLE"
  | "CHOICE_MULTI"
  | "BOOLEAN"
  | "DATE"
  | "NUMBER";

export interface QuestionOverview extends Partial<QuestionVisibilityStats> {
  id: string;
  text: string;
  type: QuestionAnalyticsType;
  preview?: TextPreview[];
  stats?: NumberStats;
  distribution?: ChoiceDistribution[];
  trueCount?: number;
  falseCount?: number;
}

export interface FormAnalyticsDto {
  totalResponses: number;
  questions: QuestionOverview[];
}

export interface QuestionAnalyticsDto {
  question: {
    id: string;
    text: string;
    description: string | null;
    type: QuestionAnalyticsType;
  };
  totalAnswers: number;
  distribution?: { value: string | number; optionId: string; count: number; text: string }[];
  stats?: NumberStats;
  answers?: string[];
  trueCount?: number;
  falseCount?: number;
}

/** Вузол шляху проходження форми - питання + скільки респондентів його бачили. */
export interface QuestionPathNode {
  questionId: string;
  text: string;
  order: number;
  shownCount: number;
}

/**
 * Перехід між двома послідовними ВИДИМИМИ питаннями серед завершених
 * відповідей. fromQuestionId: null - перехід зі старту форми до першого
 * показаного питання. Це НЕ funnel/drop-off аналітика - для того є
 * FormFunnelDto (нижче), який рахується з ResponseAttempt (autosave-
 * чернетки) і бачить покинуті проходження, не лише завершені Response.
 */
export interface QuestionPathEdge {
  fromQuestionId: string | null;
  toQuestionId: string;
  count: number;
}

export interface FormPathsDto {
  totalResponses: number;
  nodes: QuestionPathNode[];
  edges: QuestionPathEdge[];
}

export interface QuestionFunnelNode {
  questionId: string;
  text: string;
  order: number;
  reachedCount: number;
}

export interface FormFunnelDto {
  totalAttempts: number;
  totalCompletions: number;
  completionRate: number;
  nodes: QuestionFunnelNode[];
}

export interface ResponseSummary {
  id: string;
  createdAt: string;
}

export interface ResponseListDto {
  total: number;
  page: number;
  limit: number;
  data: ResponseSummary[];
}

export interface EnrichedAnswer {
  questionId: string;
  questionText: string;
  questionType: string;
  questionDescription: string | null;
  questionRequired: boolean;
  displayValue: string | number | string[];
  rawValue: string | number | string[];
}

export interface ResponseDetailsDto {
  id: string;
  formId: string;
  createdAt: string;
  answers: EnrichedAnswer[];
}

export type ExportFormat = "CSV" | "EXCEL" | "PDF";
export type ExportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface ExportJobDto {
  id: string;
  formId: string;
  format: ExportFormat;
  status: ExportStatus;
  fileName: string | null;
  responseCount: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

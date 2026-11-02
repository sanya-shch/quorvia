export const AUTH_EXPIRED_EVENT = "quorvia:auth-expired";

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
  FORM_VERSION_CONFLICT: "FORM_VERSION_CONFLICT",

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

/**
 * Єдине джерело правди про типи питань. Prisma-enum `QuestionType`
 * (backend/prisma/schema.prisma) має збігатися з цим списком - це
 * перевіряється на етапі компіляції (backend/src/shared/types/questions.check.ts).
 * Додаючи тип: оновіть цей список, і TypeScript підсвітить усі місця, де
 * `switch`/ланцюжок `if` за типом став неповним (див. assertNever).
 */
export const QUESTION_TYPES = [
  "TEXT",
  "CHOICE_SINGLE",
  "CHOICE_MULTI",
  "BOOLEAN",
  "DATE",
  "NUMBER",
  "RATING",
  "SCALE",
  "NPS",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export type QuestionDisplayVariant = "list" | "tabs" | "dropdown";

export interface QuestionOption {
  id: string;
  text: string;
  isDefault: boolean;
}

export interface QuestionConfig {
  variant?: "input" | "textarea" | "email" | "name";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  defaultValue?: boolean;
  displayVariant?: QuestionDisplayVariant;
  /** NUMBER: "slider" вимагає min < max (крок - `step`, типово 1). */
  numberVariant?: NumberVariant;
  step?: number;
  /** SCALE: підписи крайніх значень (напр. "Зовсім не згоден" / "Повністю згоден"). */
  minLabel?: string;
  maxLabel?: string;
}

export type NumberVariant = "input" | "slider";

/**
 * Шкальні типи: відповідь - ціле число в межах [min, max], які визначаються
 * типом і config (див. getScaleBounds). Умови та аналітика працюють з ними як
 * з числами; NPS додатково має розбивку на promoters/passives/detractors.
 */
export const SCALE_QUESTION_TYPES = ["RATING", "SCALE", "NPS"] as const;
export type ScaleQuestionType = (typeof SCALE_QUESTION_TYPES)[number];

export const isScaleQuestionType = (type: QuestionType): type is ScaleQuestionType =>
  (SCALE_QUESTION_TYPES as readonly QuestionType[]).includes(type);

/** Допустимі межі налаштувань шкал (їх же перевіряє бекенд-схема форми). */
export const SCALE_LIMITS = {
  /** RATING: кількість зірок (максимальне значення), min завжди 1. */
  ratingMax: { min: 3, max: 10, default: 5 },
  /** SCALE: початок шкали 0 або 1, кінець 2..10 і строго більший за початок. */
  scaleStart: { allowed: [0, 1], default: 1 },
  scaleEnd: { min: 2, max: 10, default: 5 },
  /** NPS фіксований: 0..10. */
  nps: { min: 0, max: 10 },
  labelMaxLength: 100,
} as const;

export interface ScaleBounds {
  min: number;
  max: number;
}

/**
 * Межі значень шкали з урахуванням config. Некоректний або відсутній config
 * (старі дані, ручні правки БД) не ламає відповіді: повертаємо типові межі.
 */
export const getScaleBounds = (
  type: ScaleQuestionType,
  config: QuestionConfig | null | undefined,
): ScaleBounds => {
  switch (type) {
    case "NPS":
      return { min: SCALE_LIMITS.nps.min, max: SCALE_LIMITS.nps.max };
    case "RATING": {
      const { min, max, default: def } = SCALE_LIMITS.ratingMax;
      const value = config?.max;
      return {
        min: 1,
        max: Number.isInteger(value) && value! >= min && value! <= max ? value! : def,
      };
    }
    case "SCALE": {
      const start = (SCALE_LIMITS.scaleStart.allowed as readonly number[]).includes(
        config?.min as number,
      )
        ? (config!.min as number)
        : SCALE_LIMITS.scaleStart.default;
      const endValue = config?.max;
      const end =
        Number.isInteger(endValue) &&
        endValue! >= SCALE_LIMITS.scaleEnd.min &&
        endValue! <= SCALE_LIMITS.scaleEnd.max &&
        endValue! > start
          ? endValue!
          : Math.max(SCALE_LIMITS.scaleEnd.default, start + 1);
      return { min: start, max: end };
    }
    default:
      return assertNever(type, "scale question type");
  }
};

/** Розбивка NPS: promoters 9-10, passives 7-8, detractors 0-6. */
export interface NpsBreakdown {
  promoters: number;
  passives: number;
  detractors: number;
  /** (promoters - detractors) / total * 100, одне знак після коми; null, якщо відповідей немає. */
  score: number | null;
}

/**
 * Перевірка вичерпності: у кінці `switch`/ланцюжка `if` за дискримінантом
 * значення має звузитись до `never`. Якщо з'явився новий варіант, якого
 * гілки не покривають, код перестане компілюватись; якщо ж невідоме значення
 * все одно потрапило в рантайм (рядок у БД, який випередив код), кидаємо
 * помилку замість того, щоб тихо обробити його як "останню" гілку.
 */
export function assertNever(value: never, context = "value"): never {
  throw new Error(`Unhandled ${context}: ${JSON.stringify(value)}`);
}

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

export type QuestionAnalyticsType = QuestionType;

export interface QuestionOverview extends Partial<QuestionVisibilityStats> {
  id: string;
  text: string;
  type: QuestionAnalyticsType;
  preview?: TextPreview[];
  stats?: NumberStats;
  distribution?: ChoiceDistribution[];
  /** Лише для NPS. */
  nps?: NpsBreakdown;
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
  /** Лише для NPS. */
  nps?: NpsBreakdown;
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
  rawValue: string | number | boolean | string[];
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

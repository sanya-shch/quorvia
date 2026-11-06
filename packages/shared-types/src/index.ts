export const AUTH_EXPIRED_EVENT = "quorvia:auth-expired";

/**
 * Stable API error codes: what the backend puts into the `message` field of the JSON
 * response for `AppError` (backend/src/shared/middleware/errorHandler.ts).
 * They are identifiers, not display text; the frontends translate them with i18next
 * (react-frontend/src/i18n/errorCodes.ts, vue-analytics likewise). The backend knows
 * no language, so adding a language never requires changes here or in backend/.
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

// Interface languages (React and the Vue analytics module). To add one, add an
// item here plus the matching locale files; no logic changes.
export const SUPPORTED_LOCALES = ["uk", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

export type ResponseMode = "ALL_AT_ONCE" | "STEP_BY_STEP";

/**
 * Single source of truth for question types. The Prisma enum `QuestionType`
 * (backend/prisma/schema.prisma) must match this list; this is checked at compile time
 * (backend/src/shared/types/questions.check.ts). When adding a type, update this list
 * and TypeScript flags every `switch`/`if` chain by type that became incomplete
 * (see assertNever).
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
  "RANKING",
  "MATRIX",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export type QuestionDisplayVariant = "list" | "tabs" | "dropdown";

export interface QuestionOption {
  id: string;
  text: string;
  isDefault: boolean;
  // "Other" option: the respondent types their own text when picking it. At most one
  // per question, always last, never the default. The text lives in `answers` under a
  // separate key (see otherAnswerKey), so the answer to the question itself stays the option id.
  isOther?: boolean;
}

// Suffix of the `answers` key that holds the "Other" text.
export const OTHER_ANSWER_SUFFIX = "__other";
export const OTHER_ANSWER_MAX_LENGTH = 500;

export const otherAnswerKey = (questionId: string): string => `${questionId}${OTHER_ANSWER_SUFFIX}`;

export const isOtherAnswerKey = (key: string): boolean => key.endsWith(OTHER_ANSWER_SUFFIX);

export const getOtherOption = <T extends { isOther?: boolean }>(
  options: readonly T[] | null | undefined,
): T | undefined => options?.find((option) => option.isOther);

export const isOtherSelected = (
  type: QuestionType,
  options: readonly { id: string; isOther?: boolean }[] | null | undefined,
  answer: unknown,
): boolean => {
  const other = getOtherOption(options);

  if (!other) return false;
  if (type === "CHOICE_SINGLE") return answer === other.id;
  if (type === "CHOICE_MULTI") return Array.isArray(answer) && answer.includes(other.id);

  return false;
};

export interface QuestionConfig {
  variant?: "input" | "textarea" | "email" | "name";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  defaultValue?: boolean;
  displayVariant?: QuestionDisplayVariant;
  // NUMBER: "slider" requires min < max (`step`, default 1).
  numberVariant?: NumberVariant;
  step?: number;
  // SCALE: labels for the end values (for example "Strongly disagree" / "Strongly agree").
  minLabel?: string;
  maxLabel?: string;
  // MATRIX: rows (statements). The columns (answer choices) are the question's `options`.
  rows?: MatrixRow[];
}

export type NumberVariant = "input" | "slider";

// RANKING: the respondent orders ALL options. The answer is an array of option ids,
// best first (a full permutation).
export const RANKING_LIMITS = { minOptions: 2, maxOptions: 20 } as const;

/**
 * MATRIX: a "rows x columns" table, one column per row. Rows are in `config.rows`,
 * columns are the question's `options` (so columns reuse the option machinery: ids,
 * labels, translations). The answer is an object { [rowId]: columnId }. A required
 * question needs every row answered; an optional one accepts any subset.
 */
export const MATRIX_LIMITS = {
  minRows: 1,
  maxRows: 30,
  minColumns: 2,
  maxColumns: 10,
} as const;

export interface MatrixRow {
  id: string;
  text: string;
}

export type MatrixAnswer = Record<string, string>;

// Matrix statistics: counts[i] is how many times columns[i] was picked in the row.
export interface MatrixStats {
  columns: { id: string; text: string }[];
  rows: { rowId: string; text: string; answered: number; counts: number[] }[];
}

// Position statistics of one RANKING option.
export interface RankingOptionStats {
  optionId: string;
  text: string;
  // Average position (1 is best); null while there are no rankings.
  avgPosition: number | null;
  // positions[i] is how many respondents put the option at place i + 1.
  positions: number[];
}

// Scale types: the answer is an integer within [min, max], determined by the type
// and config (see getScaleBounds). Conditions and analytics treat them as numbers;
// NPS also has a promoters/passives/detractors breakdown.
export const SCALE_QUESTION_TYPES = ["RATING", "SCALE", "NPS"] as const;
export type ScaleQuestionType = (typeof SCALE_QUESTION_TYPES)[number];

export const isScaleQuestionType = (type: QuestionType): type is ScaleQuestionType =>
  (SCALE_QUESTION_TYPES as readonly QuestionType[]).includes(type);

// Allowed scale settings (the backend form schema checks the same limits).
export const SCALE_LIMITS = {
  // RATING: number of stars (the max value), min is always 1.
  ratingMax: { min: 3, max: 10, default: 5 },
  // SCALE: start is 0 or 1, end is 2..10 and strictly greater than the start.
  scaleStart: { allowed: [0, 1], default: 1 },
  scaleEnd: { min: 2, max: 10, default: 5 },
  // NPS is fixed: 0..10.
  nps: { min: 0, max: 10 },
  labelMaxLength: 100,
} as const;

export interface ScaleBounds {
  min: number;
  max: number;
}

// Scale bounds for a config. A missing or invalid config (old data, manual DB edits)
// falls back to the defaults instead of breaking answers.
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

export interface NpsBreakdown {
  promoters: number;
  passives: number;
  detractors: number;
  // (promoters - detractors) / total * 100 with one decimal; null without answers.
  score: number | null;
}

/**
 * Exhaustiveness check: at the end of a `switch`/`if` chain over a discriminant the
 * value must narrow to `never`. A new variant that no branch covers fails to compile;
 * if an unknown value still reaches runtime (a DB string ahead of the code), we throw
 * instead of silently treating it as the "last" branch.
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
  // NPS only.
  nps?: NpsBreakdown;
  // RANKING only: per option, in option order, plus the number of full rankings.
  ranking?: RankingOptionStats[];
  rankedCount?: number;
  // MATRIX only.
  matrix?: MatrixStats;
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
  // NPS only.
  nps?: NpsBreakdown;
  // RANKING only: per option, in option order, plus the number of full rankings.
  ranking?: RankingOptionStats[];
  rankedCount?: number;
  // MATRIX only.
  matrix?: MatrixStats;
  // Choice questions with an "Other" option: custom answers by frequency (top).
  otherAnswers?: { value: string; count: number }[];
  answers?: string[];
  trueCount?: number;
  falseCount?: number;
}

export interface QuestionPathNode {
  questionId: string;
  text: string;
  order: number;
  shownCount: number;
}

/**
 * A transition between two consecutive VISIBLE questions among completed responses.
 * fromQuestionId: null is the transition from the start to the first shown question.
 * This is NOT funnel/drop-off analytics: that is FormFunnelDto (below), computed from
 * ResponseAttempt (autosaved drafts), which also sees abandoned sessions.
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
  // Form language the respondent used (null/absent: unknown).
  language?: string | null;
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
  // Form language the respondent used (null: unknown, e.g. older responses).
  language: string | null;
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

// Content languages (translation of the form itself: title, questions, options)

// Languages a form can be translated into (ISO 639-1, no regions: "en", not "en-US").
// These are NOT the application's interface languages (uk/en). RTL languages (Arabic,
// Hebrew) are left out on purpose: the viewer does not support dir="rtl" yet.
export const CONTENT_LOCALES = [
  "uk", "en", "pl", "de", "fr", "es", "it", "pt", "nl", "cs", "sk", "ro", "bg", "hu",
  "sv", "da", "fi", "nb", "tr", "el", "lt", "lv", "et", "hr", "sl", "zh", "ja", "ko",
  "hi", "vi", "id", "ka",
] as const;

export type ContentLocale = (typeof CONTENT_LOCALES)[number];

// Language of forms that already existed (until the author picks another).
export const DEFAULT_CONTENT_LANGUAGE: ContentLocale = "uk";

// How many additional languages (besides the main one) a form can have.
export const MAX_ADDITIONAL_LANGUAGES = 10;

export const isContentLocale = (value: unknown): value is ContentLocale =>
  typeof value === "string" && (CONTENT_LOCALES as readonly string[]).includes(value);

// Form texts in one language; a missing or empty field means "show the main language".
export interface FormTranslation {
  title?: string;
  description?: string;
}

export interface QuestionTranslation {
  text?: string;
  description?: string;
  // option (or matrix column) id -> text
  options?: Record<string, string>;
  // matrix row id -> text
  rows?: Record<string, string>;
  // SCALE end labels
  minLabel?: string;
  maxLabel?: string;
}

// Key is a language code from form.languages (the main language is not stored here: those are the form's own fields).
export type FormTranslations = Record<string, FormTranslation>;
export type QuestionTranslations = Record<string, QuestionTranslation>;

// Old/alternative codes sent by browsers -> our code.
const LANGUAGE_ALIASES: Record<string, string> = { no: "nb", nn: "nb" };

// "en-US" -> "en", "NB" -> "nb", "no" -> "nb"; anything that is not a language code -> null.
export const toPrimaryLanguage = (tag: string): string | null => {
  const match = /^[a-z]{2,3}/i.exec(tag.trim());
  if (!match) return null;

  const primary = match[0].toLowerCase();
  return LANGUAGE_ALIASES[primary] ?? primary;
};

// Language to show the form in: the first wish from the list (?lang=, then browser
// languages) that is available; otherwise the form's main language. Regions are
// dropped ("en-GB" matches "en").
export const pickContentLanguage = (
  candidates: readonly (string | null | undefined)[],
  available: readonly string[],
  fallback: string,
): string => {
  for (const candidate of candidates) {
    if (!candidate) continue;

    const primary = toPrimaryLanguage(candidate);
    if (primary && available.includes(primary)) return primary;
  }

  return fallback;
};

// Language stored on the response: the one the client sent, but only if it really is
// a language of this form (main or additional). Otherwise null, so a stale form cache
// or an arbitrary string cannot pollute the data.
export const resolveResponseLanguage = (
  candidate: unknown,
  defaultLanguage: string,
  languages: readonly string[],
): string | null => {
  if (typeof candidate !== "string") return null;

  const primary = toPrimaryLanguage(candidate);

  return primary && (primary === defaultLanguage || languages.includes(primary)) ? primary : null;
};

const filled = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

interface LocalizableQuestion {
  text: string;
  description?: string | null;
  options?: { id: string; text: string }[] | null;
  config?: QuestionConfig | null;
  translations?: unknown;
}

// The question in `language`. Each field falls back to the main language on its own
// when the translation is missing or empty, so a partly translated form never shows
// empty labels. The main language and languages without translations return the same question.
export const localizeQuestion = <Q extends LocalizableQuestion>(
  question: Q,
  language: string,
): Q => {
  const translation = (question.translations as QuestionTranslations | null | undefined)?.[
    language
  ];

  if (!translation) return question;

  const options = Array.isArray(question.options)
    ? question.options.map((option) =>
        filled(translation.options?.[option.id])
          ? { ...option, text: translation.options![option.id] }
          : option,
      )
    : question.options;

  const rows = question.config?.rows?.map((row) =>
    filled(translation.rows?.[row.id]) ? { ...row, text: translation.rows![row.id] } : row,
  );

  const config = question.config
    ? {
        ...question.config,
        ...(rows ? { rows } : {}),
        ...(filled(translation.minLabel) ? { minLabel: translation.minLabel } : {}),
        ...(filled(translation.maxLabel) ? { maxLabel: translation.maxLabel } : {}),
      }
    : question.config;

  return {
    ...question,
    text: filled(translation.text) ? translation.text : question.text,
    description: filled(translation.description) ? translation.description : question.description,
    options,
    config,
  };
};

export const localizeForm = <
  F extends { title: string; description?: string | null; translations?: unknown },
>(
  form: F,
  language: string,
): F => {
  const translation = (form.translations as FormTranslations | null | undefined)?.[language];

  if (!translation) return form;

  return {
    ...form,
    title: filled(translation.title) ? translation.title : form.title,
    description: filled(translation.description) ? translation.description : form.description,
  };
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Keeps only non-empty string values whose keys are in `allowedKeys`.
const cleanStringMap = (value: unknown, allowedKeys?: ReadonlySet<string>): Record<string, string> => {
  const result: Record<string, string> = {};

  if (!isPlainObject(value)) return result;

  for (const [key, text] of Object.entries(value)) {
    if ((!allowedKeys || allowedKeys.has(key)) && filled(text)) result[key] = text;
  }

  return result;
};

// Brings form translations into a valid state before saving: only languages from
// `languages`, only title/description, no empty values. Returns null when nothing is left.
export const normalizeFormTranslations = (
  translations: unknown,
  languages: readonly string[],
): FormTranslations | null => {
  if (!isPlainObject(translations)) return null;

  const result: FormTranslations = {};

  for (const language of languages) {
    const source = translations[language];
    if (!isPlainObject(source)) continue;

    const entry: FormTranslation = {};
    if (filled(source.title)) entry.title = source.title;
    if (filled(source.description)) entry.description = source.description;

    if (Object.keys(entry).length > 0) result[language] = entry;
  }

  return Object.keys(result).length > 0 ? result : null;
};

// Same for a question: drops languages that are not in `languages`, translations of
// options/rows whose ids no longer exist in the question, and empty values. The client
// therefore does not need to clean translations by hand when an option or language is removed.
export const normalizeQuestionTranslations = (
  translations: unknown,
  languages: readonly string[],
  question: {
    options?: { id: string }[] | null;
    config?: { rows?: { id: string }[] } | null;
  },
): QuestionTranslations | null => {
  if (!isPlainObject(translations)) return null;

  const optionIds = new Set((Array.isArray(question.options) ? question.options : []).map((o) => o.id));
  const rowIds = new Set((question.config?.rows ?? []).map((r) => r.id));
  const result: QuestionTranslations = {};

  for (const language of languages) {
    const source = translations[language];
    if (!isPlainObject(source)) continue;

    const entry: QuestionTranslation = {};
    if (filled(source.text)) entry.text = source.text;
    if (filled(source.description)) entry.description = source.description;
    if (filled(source.minLabel)) entry.minLabel = source.minLabel;
    if (filled(source.maxLabel)) entry.maxLabel = source.maxLabel;

    const options = cleanStringMap(source.options, optionIds);
    if (Object.keys(options).length > 0) entry.options = options;

    const rows = cleanStringMap(source.rows, rowIds);
    if (Object.keys(rows).length > 0) entry.rows = rows;

    if (Object.keys(entry).length > 0) result[language] = entry;
  }

  return Object.keys(result).length > 0 ? result : null;
};

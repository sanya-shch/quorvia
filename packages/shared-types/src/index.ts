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
  "RANKING",
  "MATRIX",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export type QuestionDisplayVariant = "list" | "tabs" | "dropdown";

export interface QuestionOption {
  id: string;
  text: string;
  isDefault: boolean;
  /**
   * Варіант «Інше»: коли респондент його обирає, він вписує власний текст.
   * Не більше одного на питання і завжди останній у списку; не буває
   * варіантом за замовчуванням. Текст лежить в `answers` окремим ключем
   * (див. otherAnswerKey), тож відповідь на саме питання лишається id варіанта.
   */
  isOther?: boolean;
}

/** Суфікс ключа в `answers`, де зберігається текст варіанта «Інше». */
export const OTHER_ANSWER_SUFFIX = "__other";
export const OTHER_ANSWER_MAX_LENGTH = 500;

export const otherAnswerKey = (questionId: string): string => `${questionId}${OTHER_ANSWER_SUFFIX}`;

export const isOtherAnswerKey = (key: string): boolean => key.endsWith(OTHER_ANSWER_SUFFIX);

export const getOtherOption = <T extends { isOther?: boolean }>(
  options: readonly T[] | null | undefined,
): T | undefined => options?.find((option) => option.isOther);

/** Чи обрано у відповіді варіант «Інше» (лише для питань із вибором). */
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
  /** NUMBER: "slider" вимагає min < max (крок - `step`, типово 1). */
  numberVariant?: NumberVariant;
  step?: number;
  /** SCALE: підписи крайніх значень (напр. "Зовсім не згоден" / "Повністю згоден"). */
  minLabel?: string;
  maxLabel?: string;
  /** MATRIX: рядки (твердження). Колонки (варіанти відповіді) - це `options` питання. */
  rows?: MatrixRow[];
}

export type NumberVariant = "input" | "slider";

/**
 * RANKING: респондент розставляє ВСІ варіанти за порядком. Відповідь - масив
 * id варіантів від найвищої позиції до найнижчої (повна перестановка).
 */
export const RANKING_LIMITS = { minOptions: 2, maxOptions: 20 } as const;

/**
 * MATRIX: таблиця "рядки x колонки", в кожному рядку обирається одна колонка.
 * Рядки - у `config.rows`, колонки - у `options` питання (так колонки
 * переважають механізми варіантів: id, підписи, переклади).
 * Відповідь - об'єкт { [rowId]: columnId }. Для обов'язкового питання
 * заповнені мають бути всі рядки, для необов'язкового - будь-яка їх частина.
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

/** Статистика матриці: counts[i] - скільки разів у рядку обрано колонку columns[i]. */
export interface MatrixStats {
  columns: { id: string; text: string }[];
  rows: { rowId: string; text: string; answered: number; counts: number[] }[];
}

/** Статистика позицій одного варіанта в питанні RANKING. */
export interface RankingOptionStats {
  optionId: string;
  text: string;
  /** Середня позиція (1 - найвища); null, якщо ще немає жодного ранжування. */
  avgPosition: number | null;
  /** positions[i] - скільки респондентів поставили варіант на позицію i + 1. */
  positions: number[];
}

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
  /** Лише для RANKING: по варіанту, у порядку options, і кількість повних ранжувань. */
  ranking?: RankingOptionStats[];
  rankedCount?: number;
  /** Лише для MATRIX. */
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
  /** Лише для NPS. */
  nps?: NpsBreakdown;
  /** Лише для RANKING: по варіанту, у порядку options, і кількість повних ранжувань. */
  ranking?: RankingOptionStats[];
  rankedCount?: number;
  /** Лише для MATRIX. */
  matrix?: MatrixStats;
  /** Питання з вибором і варіантом «Інше»: власні відповіді за частотою (топ). */
  otherAnswers?: { value: string; count: number }[];
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
  /** Мова форми, якою відповів респондент (null/відсутня - невідомо). */
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
  /** Мова форми, якою відповів респондент (null - не визначена, напр. старі відповіді). */
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

// ---------------------------------------------------------------------------
// Мови контенту (переклад самої форми: заголовок, питання, варіанти)
// ---------------------------------------------------------------------------

/**
 * Мови, якими можна перекласти форму (ISO 639-1, без регіонів: "en", а не "en-US").
 * Це НЕ мови інтерфейсу застосунку (uk/en). RTL-мови (арабська, іврит) свідомо
 * не включені: перегляд форми поки не підтримує dir="rtl".
 */
export const CONTENT_LOCALES = [
  "uk", "en", "pl", "de", "fr", "es", "it", "pt", "nl", "cs", "sk", "ro", "bg", "hu",
  "sv", "da", "fi", "nb", "tr", "el", "lt", "lv", "et", "hr", "sl", "zh", "ja", "ko",
  "hi", "vi", "id", "ka",
] as const;

export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/** Мова, якою написано вже наявні форми (поки автор не вкаже іншу). */
export const DEFAULT_CONTENT_LANGUAGE: ContentLocale = "uk";

/** Скільки додаткових мов (понад основну) може мати одна форма. */
export const MAX_ADDITIONAL_LANGUAGES = 10;

export const isContentLocale = (value: unknown): value is ContentLocale =>
  typeof value === "string" && (CONTENT_LOCALES as readonly string[]).includes(value);

/** Тексти форми однією мовою; відсутнє або порожнє поле = "показати основну мову". */
export interface FormTranslation {
  title?: string;
  description?: string;
}

export interface QuestionTranslation {
  text?: string;
  description?: string;
  /** id варіанта (або колонки матриці) -> текст. */
  options?: Record<string, string>;
  /** id рядка матриці -> текст. */
  rows?: Record<string, string>;
  /** Підписи країв шкали SCALE. */
  minLabel?: string;
  maxLabel?: string;
}

/** Ключ - код мови з form.languages (основна мова тут не зберігається: це самі поля форми). */
export type FormTranslations = Record<string, FormTranslation>;
export type QuestionTranslations = Record<string, QuestionTranslation>;

// Старі/альтернативні коди, які надсилають браузери, -> наш код.
const LANGUAGE_ALIASES: Record<string, string> = { no: "nb", nn: "nb" };

/** "en-US" -> "en", "NB" -> "nb", "no" -> "nb"; не схоже на код мови -> null. */
export const toPrimaryLanguage = (tag: string): string | null => {
  const match = /^[a-z]{2,3}/i.exec(tag.trim());
  if (!match) return null;

  const primary = match[0].toLowerCase();
  return LANGUAGE_ALIASES[primary] ?? primary;
};

/**
 * Мова, якою показати форму: перша зі списку побажань (?lang=, потім мови
 * браузера), що є серед доступних; інакше основна мова форми. Регіони
 * відкидаються ("en-GB" підійде до "en").
 */
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

/**
 * Мова, яку записуємо у відповідь респондента: надіслана клієнтом, але лише
 * якщо вона справді є мовою цієї форми (основною або додатковою). Інакше null:
 * застарілий кеш форми чи довільний рядок не повинні забруднювати дані.
 */
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

/**
 * Питання мовою `language`. Кожне поле окремо повертається до основної мови,
 * якщо перекладу немає (або він порожній), тож частково перекладена форма
 * ніколи не показує порожніх підписів. Для основної мови і мов без перекладу
 * повертається те саме питання.
 */
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

/** Лишає лише непорожні рядкові значення з ключами зі списку `allowedKeys`. */
const cleanStringMap = (value: unknown, allowedKeys?: ReadonlySet<string>): Record<string, string> => {
  const result: Record<string, string> = {};

  if (!isPlainObject(value)) return result;

  for (const [key, text] of Object.entries(value)) {
    if ((!allowedKeys || allowedKeys.has(key)) && filled(text)) result[key] = text;
  }

  return result;
};

/**
 * Приводить переклади форми до коректного стану перед збереженням: лише мови зі
 * списку `languages`, лише поля title/description, без порожніх значень.
 * Повертає null, якщо перекладів не лишилось.
 */
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

/**
 * Те саме для питання: прибирає мови, яких немає в `languages`, переклади
 * варіантів/рядків, id яких уже не існують у питанні (їх видалили чи замінили),
 * і порожні значення. Тому клієнту не обов'язково чистити переклади вручну
 * при видаленні варіанта чи мови.
 */
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

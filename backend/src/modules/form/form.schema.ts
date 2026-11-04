import { z } from "zod";
import {
  CONTENT_LOCALES,
  ErrorCode,
  MATRIX_LIMITS,
  MAX_ADDITIONAL_LANGUAGES,
  OTHER_ANSWER_SUFFIX,
  RANKING_LIMITS,
  SCALE_LIMITS,
} from "@quorvia/shared-types";
import { compileSafePattern, MAX_PATTERN_LENGTH } from "../../shared/utils/safeRegex.js";

/**
 * Верхні межі потрібні, щоб один запит (навіть у межах 100 КБ ліміту
 * express.json) не міг створити тисячі питань/опцій чи гігантські рядки,
 * які потім потрапляють в БД, експорти (PDF/Excel) і аналітику.
 */
export const FORM_LIMITS = {
  title: 200,
  description: 2_000,
  questions: 200,
  questionText: 500,
  options: 100,
  optionText: 500,
  id: 100,
  conditionRules: 50,
  conditionValueItems: 100,
  conditionValueText: 500,
  textLength: 10_000,
  scaleLabel: SCALE_LIMITS.labelMaxLength,
} as const;

const contentLocaleSchema = z.enum(CONTENT_LOCALES);

export const createFormSchema = z.object({
  title: z.string().trim().min(3).max(FORM_LIMITS.title),
  description: z.string().max(FORM_LIMITS.description).optional(),
  // Мова, якою автор пише форму (типово uk).
  defaultLanguage: contentLocaleSchema.optional(),
});

// Переклади - рядки з обмеженою довжиною. Структуру (які мови, які id варіантів
// існують) тут не перевіряємо: сервіс нормалізує її сам (normalize*Translations),
// тож застарілі ключі після видалення варіанта чи мови не ламають збереження.
const textMap = (maxItems: number) =>
  z
    .record(z.string().max(FORM_LIMITS.id), z.string().max(FORM_LIMITS.optionText))
    .refine((map) => Object.keys(map).length <= maxItems, ErrorCode.REQUEST_BODY_INVALID);

const questionTranslationSchema = z.object({
  text: z.string().max(FORM_LIMITS.questionText).optional(),
  description: z.string().max(FORM_LIMITS.description).optional(),
  options: textMap(FORM_LIMITS.options).optional(),
  rows: textMap(MATRIX_LIMITS.maxRows).optional(),
  minLabel: z.string().max(SCALE_LIMITS.labelMaxLength).optional(),
  maxLabel: z.string().max(SCALE_LIMITS.labelMaxLength).optional(),
});

const formTranslationSchema = z.object({
  title: z.string().max(FORM_LIMITS.title).optional(),
  description: z.string().max(FORM_LIMITS.description).optional(),
});

const translationsOf = <T extends z.ZodTypeAny>(entry: T) =>
  z
    .record(z.string().max(10), entry)
    .refine(
      (map) => Object.keys(map).length <= CONTENT_LOCALES.length,
      ErrorCode.REQUEST_BODY_INVALID,
    );

const conditionRuleSchema = z.object({
  questionId: z.string().max(FORM_LIMITS.id),
  operator: z.enum(["equals", "notEquals", "contains", "in", "gt", "lt"]),
  value: z.union([
    z.string().max(FORM_LIMITS.conditionValueText),
    z.number(),
    z.boolean(),
    z.array(z.string().max(FORM_LIMITS.conditionValueText)).max(FORM_LIMITS.conditionValueItems),
  ]),
});

export const conditionSchema = z.object({
  logic: z.enum(["AND", "OR"]),
  rules: z.array(conditionRuleSchema).min(1).max(FORM_LIMITS.conditionRules),
});

const base = {
  translations: translationsOf(questionTranslationSchema).nullable().optional(),
  // Суфікс зарезервований під ключ тексту «Інше» в answers (otherAnswerKey):
  // id питання, що ним закінчується, міг би зіткнутися з чужим ключем.
  id: z
    .string()
    .max(FORM_LIMITS.id)
    .refine((id) => !id.endsWith(OTHER_ANSWER_SUFFIX), ErrorCode.REQUEST_BODY_INVALID)
    .optional(),
  text: z.string().min(1).max(FORM_LIMITS.questionText),
  description: z.string().max(FORM_LIMITS.description).optional(),
  required: z.boolean().optional(),
  order: z.number().int().min(0).max(10_000),
  condition: conditionSchema.optional().nullable(),
};

const configSchema = z.object({
  variant: z.enum(["input", "textarea", "email", "name"]).optional(),
  minLength: z.number().int().min(0).max(FORM_LIMITS.textLength).optional(),
  maxLength: z.number().int().min(0).max(FORM_LIMITS.textLength).optional(),
  // Шаблон має компілюватись у RE2 (без lookahead/backreferences) - інакше
  // його не можна безпечно виконувати на сервері (ReDoS, див. safeRegex.ts).
  pattern: z
    .string()
    .max(MAX_PATTERN_LENGTH)
    .refine((value) => compileSafePattern(value) !== null, ErrorCode.VALIDATION_FORMAT_INVALID)
    .optional(),
});

const optionSchema = z.object({
  id: z.string().max(FORM_LIMITS.id),
  text: z.string().min(1).max(FORM_LIMITS.optionText),
  isDefault: z.boolean().optional(),
  isOther: z.boolean().optional(),
});

// «Інше»: не більше одного, завжди останнім (так його легко "закріпити" при
// рандомізації варіантів), і не може бути варіантом за замовчуванням -
// інакше форма стартувала б з обраним «Інше» і порожнім обов'язковим текстом.
const optionsSchema = z
  .array(optionSchema)
  .min(1)
  .max(FORM_LIMITS.options)
  .refine((options) => {
    const others = options.filter((o) => o.isOther);

    if (others.length === 0) return true;

    return others.length === 1 && options[options.length - 1].isOther && !others[0].isDefault;
  }, ErrorCode.REQUEST_BODY_INVALID);

// RANKING: від 2 до 20 варіантів; id унікальні, бо відповідь - перестановка id
// (дублікат зробив би валідну відповідь неможливою). «Інше»/isDefault для
// ранжування не мають сенсу: isOther відкидається схемою (omit).
const rankingOptionsSchema = z
  .array(optionSchema.omit({ isOther: true }))
  .min(RANKING_LIMITS.minOptions)
  .max(RANKING_LIMITS.maxOptions)
  .refine(
    (options) => new Set(options.map((o) => o.id)).size === options.length,
    ErrorCode.REQUEST_BODY_INVALID,
  );

// MATRIX: колонки - це options (2-10, унікальні id, без «Інше»), рядки - config.rows
// (1-30, унікальні id). Відповідь - { rowId: columnId }, тому id в обох списках
// мають бути унікальними всередині свого списку.
const matrixColumnsSchema = z
  .array(optionSchema.omit({ isOther: true }))
  .min(MATRIX_LIMITS.minColumns)
  .max(MATRIX_LIMITS.maxColumns)
  .refine(
    (options) => new Set(options.map((o) => o.id)).size === options.length,
    ErrorCode.REQUEST_BODY_INVALID,
  );

const matrixConfigSchema = z.object({
  rows: z
    .array(
      z.object({
        id: z.string().min(1).max(FORM_LIMITS.id),
        text: z.string().trim().min(1).max(FORM_LIMITS.optionText),
      }),
    )
    .min(MATRIX_LIMITS.minRows)
    .max(MATRIX_LIMITS.maxRows)
    .refine(
      (rows) => new Set(rows.map((r) => r.id)).size === rows.length,
      ErrorCode.REQUEST_BODY_INVALID,
    ),
});

export const questionSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("TEXT"),
    config: configSchema.optional(),
  }),

  z.object({
    ...base,
    type: z.literal("CHOICE_SINGLE"),
    options: optionsSchema,
    config: z
      .object({
        displayVariant: z.enum(["list", "tabs", "dropdown"]).optional(),
      })
      .optional(),
  }),

  z.object({
    ...base,
    type: z.literal("CHOICE_MULTI"),
    options: optionsSchema,
    config: z
      .object({
        displayVariant: z.enum(["list", "tabs", "dropdown"]).optional(),
      })
      .optional(),
  }),

  z.object({
    ...base,
    type: z.literal("BOOLEAN"),
    config: z
      .object({
        defaultValue: z.boolean().optional(),
      })
      .optional(),
  }),

  z.object({
    ...base,
    type: z.literal("DATE"),
  }),

  z.object({
    ...base,
    type: z.literal("NUMBER"),
    config: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
        numberVariant: z.enum(["input", "slider"]).optional(),
        step: z.number().positive().optional(),
      })
      // Слайдеру потрібен скінченний діапазон, інакше немає що рухати.
      .refine(
        (c) =>
          c.numberVariant !== "slider" ||
          (c.min !== undefined && c.max !== undefined && c.min < c.max),
        ErrorCode.REQUEST_BODY_INVALID,
      )
      .nullable()
      .optional(),
  }),

  z.object({
    ...base,
    type: z.literal("RATING"),
    config: z
      .object({
        max: z
          .number()
          .int()
          .min(SCALE_LIMITS.ratingMax.min)
          .max(SCALE_LIMITS.ratingMax.max)
          .optional(),
      })
      .nullable()
      .optional(),
  }),

  z.object({
    ...base,
    type: z.literal("SCALE"),
    config: z
      .object({
        min: z
          .number()
          .int()
          .refine((v) => (SCALE_LIMITS.scaleStart.allowed as readonly number[]).includes(v))
          .optional(),
        max: z
          .number()
          .int()
          .min(SCALE_LIMITS.scaleEnd.min)
          .max(SCALE_LIMITS.scaleEnd.max)
          .optional(),
        minLabel: z.string().trim().max(FORM_LIMITS.scaleLabel).optional(),
        maxLabel: z.string().trim().max(FORM_LIMITS.scaleLabel).optional(),
      })
      .refine(
        (c) =>
          (c.max ?? SCALE_LIMITS.scaleEnd.default) > (c.min ?? SCALE_LIMITS.scaleStart.default),
        ErrorCode.REQUEST_BODY_INVALID,
      )
      .nullable()
      .optional(),
  }),

  z.object({
    ...base,
    type: z.literal("NPS"),
  }),

  z.object({
    ...base,
    type: z.literal("RANKING"),
    options: rankingOptionsSchema,
  }),

  z.object({
    ...base,
    type: z.literal("MATRIX"),
    options: matrixColumnsSchema,
    config: matrixConfigSchema,
  }),
]);

export const updateFormSchema = z.object({
  title: z.string().max(FORM_LIMITS.title),
  description: z.string().max(FORM_LIMITS.description).optional(),
  responseMode: z.enum(["ALL_AT_ONCE", "STEP_BY_STEP"]).optional(),
  // Мови контенту. Усі три поля необов'язкові: старий клієнт, що їх не знає,
  // нічого не змінює (зокрема не стирає переклади).
  defaultLanguage: contentLocaleSchema.optional(),
  languages: z
    .array(contentLocaleSchema)
    .max(MAX_ADDITIONAL_LANGUAGES)
    .refine((list) => new Set(list).size === list.length, ErrorCode.REQUEST_BODY_INVALID)
    .optional(),
  translations: translationsOf(formTranslationSchema).nullable().optional(),
  questions: z.array(questionSchema).max(FORM_LIMITS.questions),
  // Версія форми, яку редагував клієнт (optimistic lock). Якщо передана і вже
  // не збігається з поточною - 409 FORM_VERSION_CONFLICT. Без неї застосовується
  // версія, прочитана на початку запиту: захищає від гонки всередині самого
  // запиту, але не від застарілого редактора.
  version: z.number().int().min(1).optional(),
});

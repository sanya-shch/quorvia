import { z } from "zod";
import { ErrorCode } from "@quorvia/shared-types";
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
} as const;

export const createFormSchema = z.object({
  title: z.string().trim().min(3).max(FORM_LIMITS.title),
  description: z.string().max(FORM_LIMITS.description).optional(),
});

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
  id: z.string().max(FORM_LIMITS.id).optional(),
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
    options: z.array(optionSchema).min(1).max(FORM_LIMITS.options),
    config: z
      .object({
        displayVariant: z.enum(["list", "tabs", "dropdown"]).optional(),
      })
      .optional(),
  }),

  z.object({
    ...base,
    type: z.literal("CHOICE_MULTI"),
    options: z.array(optionSchema).min(1).max(FORM_LIMITS.options),
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
      })
      .nullable()
      .optional(),
  }),
]);

export const updateFormSchema = z.object({
  title: z.string().max(FORM_LIMITS.title),
  description: z.string().max(FORM_LIMITS.description).optional(),
  responseMode: z.enum(["ALL_AT_ONCE", "STEP_BY_STEP"]).optional(),
  questions: z.array(questionSchema).max(FORM_LIMITS.questions),
  // Версія форми, яку редагував клієнт (optimistic lock). Якщо передана і вже
  // не збігається з поточною - 409 FORM_VERSION_CONFLICT. Без неї застосовується
  // версія, прочитана на початку запиту: захищає від гонки всередині самого
  // запиту, але не від застарілого редактора.
  version: z.number().int().min(1).optional(),
});

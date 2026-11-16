import { z } from "zod";
import {
  CALCULATION_DISPLAYS,
  CALCULATION_LIMITS,
  CALCULATION_RESULT_TYPES,
  CONTENT_LOCALES,
  END_RULE_LIMITS,
  ErrorCode,
  FILE_LIMITS,
  FORM_FONTS,
  FORM_RADII,
  FORM_THEME_MODES,
  isHttpUrl,
  isScoreBound,
  isScoreValue,
  MAX_RESPONSES_LIMIT,
  IMAGE_CHOICE_LIMITS,
  MATRIX_LIMITS,
  MAX_ADDITIONAL_LANGUAGES,
  OTHER_ANSWER_SUFFIX,
  RANKING_LIMITS,
  SCALE_LIMITS,
  SCORE_LIMITS,
  SCREEN_LIMITS,
  THEME_COLOR_PATTERN,
} from "@quorvia/shared-types";
import { compileSafePattern, MAX_PATTERN_LENGTH } from "../../shared/utils/safeRegex.js";

// Upper bounds so a single request (even within the 100 KB express.json limit) cannot
// create thousands of questions/options or huge strings that later end up in the DB,
// exports (PDF/Excel) and analytics.
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
  // Language the author writes the form in (default uk).
  defaultLanguage: contentLocaleSchema.optional(),
});

// Translations are length-limited strings. The structure (which languages, which option
// ids exist) is not checked here: the service normalizes it (normalize*Translations), so
// stale keys after removing an option or a language do not break saving.
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
  welcomeTitle: z.string().max(SCREEN_LIMITS.title).optional(),
  welcomeText: z.string().max(SCREEN_LIMITS.text).optional(),
  welcomeButton: z.string().max(SCREEN_LIMITS.buttonLabel).optional(),
  endText: z.string().max(SCREEN_LIMITS.text).optional(),
  // Score category id -> its label.
  scoreCategories: z
    .record(z.string().max(SCORE_LIMITS.categoryId), z.string().max(SCORE_LIMITS.categoryLabel))
    .refine(
      (map) => Object.keys(map).length <= SCORE_LIMITS.categories,
      ErrorCode.REQUEST_BODY_INVALID,
    )
    .optional(),
  // End rule id -> text of that rule's end screen.
  endRules: z
    .record(z.string().max(END_RULE_LIMITS.id), z.string().max(SCREEN_LIMITS.text))
    .refine(
      (map) => Object.keys(map).length <= END_RULE_LIMITS.rules,
      ErrorCode.REQUEST_BODY_INVALID,
    )
    .optional(),
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
  // The suffix is reserved for the "Other" text key in answers (otherAnswerKey): a question
  // id ending with it could collide with someone else's key.
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
  // The pattern must compile in RE2 (no lookahead/backreferences); otherwise it cannot be
  // run safely on the server (ReDoS, see safeRegex.ts).
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

// Points (see FormScoring): see SCORE_LIMITS, at most 2 decimals.
const scoreSchema = z.number().refine(isScoreValue, ErrorCode.REQUEST_BODY_INVALID);

// Only the options of choice questions carry points. A ranking or matrix option that arrives with
// a `score` has it stripped (these schemas are not strict): there is nothing to score there.
const scoredOptionSchema = optionSchema.extend({ score: scoreSchema.nullable().optional() });

// "Other": at most one, always last (so it is easy to "pin" when options are randomized),
// and never the default option: the form would otherwise start with "Other" selected and an
// empty required text.
const optionsSchema = z
  .array(scoredOptionSchema)
  .min(1)
  .max(FORM_LIMITS.options)
  .refine((options) => {
    const others = options.filter((o) => o.isOther);

    if (others.length === 0) return true;

    return others.length === 1 && options[options.length - 1].isOther && !others[0].isDefault;
  }, ErrorCode.REQUEST_BODY_INVALID);

// IMAGE_CHOICE: 2 to 12 options with an optional picture each (an asset of this form, checked
// by the service on save). No "Other": a picture cannot be free text.
const imageOptionSchema = scoredOptionSchema
  .omit({ isOther: true })
  .extend({ imageAssetId: z.uuid().nullable().optional() });

const imageChoiceOptionsSchema = z
  .array(imageOptionSchema)
  .min(IMAGE_CHOICE_LIMITS.minOptions)
  .max(IMAGE_CHOICE_LIMITS.maxOptions)
  .refine(
    (options) => new Set(options.map((o) => o.id)).size === options.length,
    ErrorCode.REQUEST_BODY_INVALID,
  );

// FILE: how many files may be attached. No options.
const fileConfigSchema = z
  .object({ maxFiles: z.number().int().min(1).max(FILE_LIMITS.maxFilesPerQuestion) })
  .nullable()
  .optional();

// CALCULATION: the formula text and how its result is shown. Only the shape is checked here; the
// service parses and type-checks the formula against the other questions on save (form.calculation.ts).
const calculationConfigSchema = z.object({
  formula: z.string().trim().min(1).max(CALCULATION_LIMITS.formula),
  resultType: z.enum(CALCULATION_RESULT_TYPES),
  decimals: z
    .number()
    .int()
    .min(CALCULATION_LIMITS.decimals.min)
    .max(CALCULATION_LIMITS.decimals.max)
    .optional(),
  prefix: z.string().max(CALCULATION_LIMITS.affix).optional(),
  suffix: z.string().max(CALCULATION_LIMITS.affix).optional(),
  display: z.enum(CALCULATION_DISPLAYS).optional(),
  emptyAsZero: z.boolean().optional(),
});

// RANKING: 2 to 20 options; ids are unique because the answer is a permutation of ids (a
// duplicate would make a valid answer impossible). "Other"/isDefault make no sense for
// ranking: isOther is dropped by the schema (omit).
const rankingOptionsSchema = z
  .array(optionSchema.omit({ isOther: true }))
  .min(RANKING_LIMITS.minOptions)
  .max(RANKING_LIMITS.maxOptions)
  .refine(
    (options) => new Set(options.map((o) => o.id)).size === options.length,
    ErrorCode.REQUEST_BODY_INVALID,
  );

// MATRIX: columns are options (2-10, unique ids, no "Other"), rows are config.rows (1-30,
// unique ids). The answer is { rowId: columnId }, so ids must be unique inside each list.
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
    type: z.literal("IMAGE_CHOICE"),
    options: imageChoiceOptionsSchema,
  }),

  z.object({
    ...base,
    type: z.literal("FILE"),
    config: fileConfigSchema,
  }),

  z.object({
    ...base,
    // The respondent never fills it in, so it can never be required.
    required: z
      .boolean()
      .optional()
      .transform(() => false),
    type: z.literal("CALCULATION"),
    config: calculationConfigSchema,
  }),

  z.object({
    ...base,
    type: z.literal("BOOLEAN"),
    config: z
      .object({
        defaultValue: z.boolean().optional(),
        // Points for "yes" and for "no" (see FormScoring).
        score: z.strictObject({ true: scoreSchema, false: scoreSchema }).nullable().optional(),
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
        // Points = the answer times this (see FormScoring).
        scoreMultiplier: scoreSchema.nullable().optional(),
      })
      // A slider needs a finite range, otherwise there is nothing to move.
      .refine(
        (c) =>
          c.numberVariant !== "slider" ||
          (c.min !== undefined && c.max !== undefined && c.min < c.max),
        ErrorCode.REQUEST_BODY_INVALID,
      )
      // A scored number needs a finite range: without it the best possible score, and so the
      // percentage, is unknown.
      .refine(
        (c) => !c.scoreMultiplier || (c.min !== undefined && c.max !== undefined && c.min <= c.max),
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
        scoreMultiplier: scoreSchema.nullable().optional(),
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
        scoreMultiplier: scoreSchema.nullable().optional(),
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
    config: z
      .object({
        scoreMultiplier: scoreSchema.nullable().optional(),
      })
      .nullable()
      .optional(),
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

// Welcome and end screens. Strict like the theme: unknown keys are rejected. The redirect goes
// through isHttpUrl, so only absolute http(s) URLs can ever be stored.
const welcomeScreenSchema = z.strictObject({
  title: z.string().trim().min(1).max(SCREEN_LIMITS.title),
  text: z.string().max(SCREEN_LIMITS.text).nullable().optional(),
  buttonLabel: z.string().max(SCREEN_LIMITS.buttonLabel).nullable().optional(),
});

const endScreenSchema = z.strictObject({
  text: z.string().trim().min(1).max(SCREEN_LIMITS.text),
  redirectUrl: z
    .string()
    .refine(isHttpUrl, ErrorCode.VALIDATION_FORMAT_INVALID)
    .nullable()
    .optional(),
});

// Scoring: whether the form scores its responses, and the categories of the total. The ranges are
// inclusive and must not overlap (a total falls into at most one category).
const scoreCategorySchema = z
  .strictObject({
    id: z.string().min(1).max(SCORE_LIMITS.categoryId),
    label: z.string().trim().min(1).max(SCORE_LIMITS.categoryLabel),
    min: z.number().refine(isScoreBound, ErrorCode.REQUEST_BODY_INVALID),
    max: z.number().refine(isScoreBound, ErrorCode.REQUEST_BODY_INVALID),
  })
  .refine((category) => category.min <= category.max, ErrorCode.REQUEST_BODY_INVALID);

const scoringSchema = z.strictObject({
  enabled: z.boolean(),
  categories: z
    .array(scoreCategorySchema)
    .max(SCORE_LIMITS.categories)
    .refine(
      (categories) => new Set(categories.map((c) => c.id)).size === categories.length,
      ErrorCode.REQUEST_BODY_INVALID,
    )
    .refine((categories) => {
      const sorted = [...categories].sort((a, b) => a.min - b.min);

      return sorted.every((c, i) => i === 0 || c.min > sorted[i - 1]!.max);
    }, ErrorCode.REQUEST_BODY_INVALID),
});

// Conditional end screens: the first rule whose condition holds decides the screen. That the
// questions in the conditions exist and can be compared is checked when the form is saved (see
// form.endRules.ts), because the question types are only known there.
const endRuleSchema = z.strictObject({
  id: z.string().min(1).max(END_RULE_LIMITS.id),
  condition: conditionSchema,
  screen: endScreenSchema,
});

// Strict: unknown keys are rejected, not silently stored. Colors must be plain hex values.
const themeColorSchema = z.string().regex(THEME_COLOR_PATTERN, ErrorCode.VALIDATION_FORMAT_INVALID);

const themeSchema = z.strictObject({
  mode: z.enum(FORM_THEME_MODES).optional(),
  primaryColor: themeColorSchema.optional(),
  backgroundColor: themeColorSchema.optional(),
  textColor: themeColorSchema.optional(),
  font: z.enum(FORM_FONTS).optional(),
  radius: z.enum(FORM_RADII).optional(),
});

export const updateFormSchema = z.object({
  title: z.string().max(FORM_LIMITS.title),
  description: z.string().max(FORM_LIMITS.description).optional(),
  responseMode: z.enum(["ALL_AT_ONCE", "STEP_BY_STEP"]).optional(),
  // Content languages. All three fields are optional: an old client that does not know them
  // changes nothing (in particular it does not erase translations).
  defaultLanguage: contentLocaleSchema.optional(),
  languages: z
    .array(contentLocaleSchema)
    .max(MAX_ADDITIONAL_LANGUAGES)
    .refine((list) => new Set(list).size === list.length, ErrorCode.REQUEST_BODY_INVALID)
    .optional(),
  translations: translationsOf(formTranslationSchema).nullable().optional(),
  // The logo: an asset uploaded to this form (POST /forms/:formId/assets). null removes it,
  // omitted leaves it as is.
  logoAssetId: z.uuid().nullable().optional(),
  // Appearance of the public page. null removes the theme, omitted leaves it as is.
  theme: themeSchema.nullable().optional(),
  // Screens around the form. null removes a screen, omitted leaves it as is.
  // Closing: a moment (ISO 8601 with an offset) and/or a number of responses. null removes a limit,
  // omitted leaves it as is.
  closesAt: z.iso.datetime({ offset: true }).nullable().optional(),
  maxResponses: z.number().int().min(1).max(MAX_RESPONSES_LIMIT).nullable().optional(),
  welcomeScreen: welcomeScreenSchema.nullable().optional(),
  endScreen: endScreenSchema.nullable().optional(),
  // Scoring settings. null removes them, omitted leaves them as is.
  scoring: scoringSchema.nullable().optional(),
  // Conditional end screens, checked in order. null or [] removes them, omitted leaves them as is.
  endRules: z
    .array(endRuleSchema)
    .max(END_RULE_LIMITS.rules)
    .refine(
      (rules) => new Set(rules.map((rule) => rule.id)).size === rules.length,
      ErrorCode.REQUEST_BODY_INVALID,
    )
    .nullable()
    .optional(),
  questions: z.array(questionSchema).max(FORM_LIMITS.questions),
  // Form version the client edited (optimistic lock). If sent and no longer equal to the
  // current one: 409 FORM_VERSION_CONFLICT. Without it the version read at the start of the
  // request applies: it protects against a race inside the request itself, but not against a
  // stale editor.
  version: z.number().int().min(1).optional(),
});

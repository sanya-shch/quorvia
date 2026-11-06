import { z } from "zod";
import { Question } from "../../shared/types/questions.js";
import {
  assertNever,
  ErrorCode,
  getOtherOption,
  getScaleBounds,
  isOtherSelected,
  OTHER_ANSWER_MAX_LENGTH,
  otherAnswerKey,
} from "@quorvia/shared-types";
import type { Answers } from "./response.types.js";
import { compileSafePattern } from "../../shared/utils/safeRegex.js";
import { MAX_ANSWER_STRING_LENGTH } from "../../shared/schemas/answers.js";

export const buildResponseSchema = (questions: unknown, visibleQuestionIds?: Set<string>) => {
  const shape: Record<string, z.ZodTypeAny> = {};
  // Questions with "Other" that need their text checked (see superRefine below).
  const withOther: Question[] = [];

  for (const q of questions as Question[]) {
    let schema;

    switch (q.type) {
      case "TEXT": {
        schema = z
          .string()
          .min(1, ErrorCode.VALIDATION_FIELD_REQUIRED)
          .max(MAX_ANSWER_STRING_LENGTH);

        if (q.config?.variant === "email") {
          schema = schema.email(ErrorCode.VALIDATION_EMAIL_INVALID);
        }

        if (q.config?.minLength) {
          schema = schema.min(q.config.minLength);
        }

        if (q.config?.maxLength) {
          schema = schema.max(q.config.maxLength);
        }

        if (q.config?.pattern) {
          // RE2 (linear time) instead of new RegExp to prevent ReDoS, see safeRegex.ts. If an older
          // pattern in the DB does not compile in RE2, the format check is skipped instead of
          // failing the submit with a 500.
          const pattern = compileSafePattern(q.config.pattern);

          if (pattern) {
            schema = schema.refine(
              (value: string) => pattern.test(value),
              ErrorCode.VALIDATION_FORMAT_INVALID,
            );
          }
        }

        break;
      }

      case "NUMBER": {
        schema = z.number();

        if (q.config?.min !== undefined) {
          schema = schema.min(q.config.min);
        }

        if (q.config?.max !== undefined) {
          schema = schema.max(q.config.max);
        }

        const { numberVariant, step, min } = q.config ?? {};

        if (numberVariant === "slider" && step !== undefined && min !== undefined) {
          // A slider only yields values on the min + k*step grid; the tolerance covers binary
          // fraction errors (0.1 * 3 !== 0.3).
          schema = schema.refine((value: number) => {
            const steps = (value - min) / step;
            return Math.abs(steps - Math.round(steps)) < 1e-9;
          }, ErrorCode.VALIDATION_FORMAT_INVALID);
        }

        break;
      }

      case "RATING":
      case "SCALE":
      case "NPS": {
        // An integer within the scale (bounds come from config, see getScaleBounds). 0 is a valid
        // answer (NPS, a scale starting at 0), hence not z.number().min(1).
        const { min, max } = getScaleBounds(q.type, q.config);

        schema = z.number().int().min(min).max(max);

        break;
      }

      case "BOOLEAN": {
        schema = z.boolean();

        if (q.required) {
          schema = schema.refine((val) => val === true, ErrorCode.VALIDATION_MUST_BE_ACCEPTED);
        }

        break;
      }

      case "DATE": {
        schema = z
          .string()
          .refine((val) => !isNaN(Date.parse(val)), ErrorCode.VALIDATION_DATE_INVALID);
        break;
      }

      case "CHOICE_SINGLE": {
        const optionIds = (q.options as { id: string }[]).map((o) => o.id);

        schema = z.enum(optionIds as [string, ...string[]]);

        break;
      }

      case "CHOICE_MULTI": {
        const optionIds = (q.options as { id: string }[]).map((o) => o.id);

        schema = z.array(z.enum(optionIds as [string, ...string[]]));

        if (q.required) {
          schema = schema.min(1);
        }

        break;
      }

      case "MATRIX": {
        const rows = q.config?.rows ?? [];
        const columnIds = (q.options as { id: string }[]).map((o) => o.id);
        const cell = z.enum(columnIds as [string, ...string[]]);

        // A required matrix needs every row filled; an optional one accepts any subset. strict():
        // a row id that is not in the question is rejected.
        schema = z
          .object(Object.fromEntries(rows.map((row) => [row.id, q.required ? cell : cell.optional()])))
          .strict();

        break;
      }

      case "RANKING": {
        const optionIds = (q.options as { id: string }[]).map((o) => o.id);

        // A full permutation of the options: every id, no duplicates, no extras.
        schema = z
          .array(z.enum(optionIds as [string, ...string[]]))
          .length(optionIds.length)
          .refine((ids) => new Set(ids).size === ids.length, ErrorCode.VALIDATION_FORMAT_INVALID);

        break;
      }

      default:
        return assertNever(q.type, "question type");
    }

    const isVisible = !visibleQuestionIds || visibleQuestionIds.has(q.id);

    if (!isVisible) {
      schema = schema.optional();
    } else if (!q.required && q.type !== "BOOLEAN") {
      schema = schema.optional();
    }

    shape[q.id] = schema;

    if (
      (q.type === "CHOICE_SINGLE" || q.type === "CHOICE_MULTI") &&
      getOtherOption(q.options) &&
      isVisible
    ) {
      // superRefine checks the value (the error must go on the question id, not on the helper
      // key: the client shows messages by that id).
      shape[otherAnswerKey(q.id)] = z.unknown().optional();
      withOther.push(q);
    }
  }

  return z.object(shape).superRefine((data, ctx) => {
    for (const q of withOther) {
      const answer = (data as Answers)[q.id];

      if (!isOtherSelected(q.type, q.options, answer)) continue;

      const text = (data as Record<string, unknown>)[otherAnswerKey(q.id)];
      const trimmed = typeof text === "string" ? text.trim() : "";

      if (trimmed === "") {
        ctx.addIssue({
          code: "custom",
          path: [q.id],
          message: ErrorCode.VALIDATION_FIELD_REQUIRED,
        });
      } else if (trimmed.length > OTHER_ANSWER_MAX_LENGTH) {
        ctx.addIssue({
          code: "custom",
          path: [q.id],
          message: ErrorCode.VALIDATION_FORMAT_INVALID,
        });
      }
    }
  });
};

// Keeps only visible questions in the stored answers; the "Other" text is kept only if
// "Other" is really selected (leftovers of an earlier choice are dropped) and is trimmed.
export const cleanAnswers = (
  questions: unknown,
  data: Answers,
  visibleQuestionIds: Set<string>,
): Answers => {
  const cleaned: Answers = {};

  for (const q of questions as Question[]) {
    if (!visibleQuestionIds.has(q.id)) continue;

    const value = data[q.id];
    // An empty matrix means "not answered" (as on the client); otherwise { q: {} } for an
    // optional matrix would count as an answer in analytics.
    const isEmptyMatrix =
      q.type === "MATRIX" &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0;

    if (value !== undefined && !isEmptyMatrix) {
      cleaned[q.id] = value;
    }

    if (isOtherSelected(q.type, q.options, data[q.id])) {
      const text = (data as Record<string, unknown>)[otherAnswerKey(q.id)];

      if (typeof text === "string") {
        cleaned[otherAnswerKey(q.id)] = text.trim();
      }
    }
  }

  return cleaned;
};

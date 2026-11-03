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
  // Питання з «Інше», яким потрібна перевірка тексту (див. superRefine нижче).
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
          // RE2 (лінійний час) замість new RegExp - захист від ReDoS, див.
          // safeRegex.ts. Якщо старий (до цієї зміни) шаблон в БД не
          // компілюється в RE2, перевірку формату пропускаємо, а не
          // валимо відправку 500-ю.
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
          // Слайдер віддає лише значення на сітці min + k*step; допуск - для
          // похибок двійкових дробів (0.1 * 3 !== 0.3).
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
        // Ціле число в межах шкали (межі - з config, див. getScaleBounds).
        // 0 - коректна відповідь (NPS, шкала з нуля), тому не z.number().min(1).
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
      // Значення перевіряє superRefine (помилку треба віддати на id питання,
      // а не на службовий ключ - саме за ним клієнт показує повідомлення).
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

/**
 * Залишає в зберігаємих відповідях лише видимі питання; текст «Інше»
 * потрапляє, тільки якщо «Інше» справді обране (залишок від попереднього
 * вибору респондента не зберігаємо) - і вже обрізаним від пробілів.
 */
export const cleanAnswers = (
  questions: unknown,
  data: Answers,
  visibleQuestionIds: Set<string>,
): Answers => {
  const cleaned: Answers = {};

  for (const q of questions as Question[]) {
    if (!visibleQuestionIds.has(q.id)) continue;

    if (data[q.id] !== undefined) {
      cleaned[q.id] = data[q.id];
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

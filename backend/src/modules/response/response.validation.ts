import { z } from "zod";
import { Question } from "../../shared/types/questions.js";
import { ErrorCode } from "@surveycraft/shared-types";
import { compileSafePattern } from "../../shared/utils/safeRegex.js";
import { MAX_ANSWER_STRING_LENGTH } from "../../shared/schemas/answers.js";

export const buildResponseSchema = (questions: unknown, visibleQuestionIds?: Set<string>) => {
  const shape: Record<string, z.ZodTypeAny> = {};

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
        throw new Error(`Unsupported question type: ${q.type}`);
    }

    const isVisible = !visibleQuestionIds || visibleQuestionIds.has(q.id);

    if (!isVisible) {
      schema = schema.optional();
    } else if (!q.required && q.type !== "BOOLEAN") {
      schema = schema.optional();
    }

    shape[q.id] = schema;
  }

  return z.object(shape);
};

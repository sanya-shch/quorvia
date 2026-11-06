import { z } from "zod";
import { MATRIX_LIMITS, OTHER_ANSWER_SUFFIX } from "@quorvia/shared-types";

/**
 * Shared "answers" schema for the public endpoints (submit and autosave). They are
 * anonymous, so without hard bounds a single request within the 100 KB express.json limit
 * could carry thousands of keys or large strings, which validation, the condition engine
 * and analytics then process. Per-question limits (maxLength, min/max, options) come from
 * buildResponseSchema; this is only the general ceiling.
 */
export const MAX_ANSWER_KEYS = 500;
// question id (up to 100 characters) plus the "Other" text key suffix.
export const MAX_ANSWER_KEY_LENGTH = 100 + OTHER_ANSWER_SUFFIX.length;
export const MAX_ANSWER_STRING_LENGTH = 10_000;
export const MAX_ANSWER_ARRAY_ITEMS = 200;
export const MAX_SESSION_KEY_LENGTH = 100;
export const MAX_REACHED_QUESTION_IDS = 200;

const answerValueSchema = z.union([
  z.string().max(MAX_ANSWER_STRING_LENGTH),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(MAX_ANSWER_ARRAY_ITEMS),
  // MATRIX: { [rowId]: columnId }. Keys and values are ids (up to 100 characters), at most
  // MATRIX_LIMITS.maxRows rows.
  z
    .record(z.string().max(100), z.string().max(100))
    .refine((cells) => Object.keys(cells).length <= MATRIX_LIMITS.maxRows, {
      message: "Too many matrix rows",
    }),
]);

export const answersSchema = z
  .record(z.string().max(MAX_ANSWER_KEY_LENGTH), answerValueSchema)
  .refine((answers) => Object.keys(answers).length <= MAX_ANSWER_KEYS, {
    message: "Too many answers",
  });

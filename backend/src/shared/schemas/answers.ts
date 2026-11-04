import { z } from "zod";
import { MATRIX_LIMITS, OTHER_ANSWER_SUFFIX } from "@quorvia/shared-types";

/**
 * Спільна схема "answers" для публічних ендпоінтів (відправка відповіді та
 * autosave). Ці ендпоінти анонімні, тому без жорстких меж один запит у
 * межах 100 КБ ліміту express.json міг би тримати тисячі ключів/великі
 * рядки, а їх потім обробляють валідація, condition-engine та аналітика.
 * Конкретні обмеження для кожного питання (maxLength, min/max, options)
 * накладає buildResponseSchema; тут - лише загальна "стеля".
 */
export const MAX_ANSWER_KEYS = 500;
// id питання (до 100 символів) + суфікс ключа тексту «Інше».
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
  // MATRIX: { [rowId]: columnId }. Ключі й значення - id (до 100 символів), рядків
  // не більше за MATRIX_LIMITS.maxRows.
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

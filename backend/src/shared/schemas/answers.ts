import { z } from "zod";

/**
 * Спільна схема "answers" для публічних ендпоінтів (відправка відповіді та
 * autosave). Ці ендпоінти анонімні, тому без жорстких меж один запит у
 * межах 100 КБ ліміту express.json міг би тримати тисячі ключів/великі
 * рядки, а їх потім обробляють валідація, condition-engine та аналітика.
 * Конкретні обмеження для кожного питання (maxLength, min/max, options)
 * накладає buildResponseSchema; тут - лише загальна "стеля".
 */
export const MAX_ANSWER_KEYS = 500;
export const MAX_ANSWER_STRING_LENGTH = 10_000;
export const MAX_ANSWER_ARRAY_ITEMS = 200;
export const MAX_SESSION_KEY_LENGTH = 100;
export const MAX_REACHED_QUESTION_IDS = 200;

const answerValueSchema = z.union([
  z.string().max(MAX_ANSWER_STRING_LENGTH),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(MAX_ANSWER_ARRAY_ITEMS),
]);

export const answersSchema = z
  .record(z.string().max(100), answerValueSchema)
  .refine((answers) => Object.keys(answers).length <= MAX_ANSWER_KEYS, {
    message: "Too many answers",
  });

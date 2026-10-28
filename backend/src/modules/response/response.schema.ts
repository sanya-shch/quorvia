import { z } from "zod";
import { answersSchema, MAX_SESSION_KEY_LENGTH } from "../../shared/schemas/answers.js";

export const submitResponseSchema = z.object({
  // Опційно: якщо респондент autosave-ився під час проходження (той самий
  // sessionKey, що й у PUT /:shareId/attempt), сервер позначить цю спробу
  // completedAt - funnel-аналітика бачитиме її як завершену, а не покинуту.
  sessionKey: z.string().min(1).max(MAX_SESSION_KEY_LENGTH).optional(),
  answers: answersSchema,
});

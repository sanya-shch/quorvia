import { z } from "zod";
import { answersSchema, MAX_SESSION_KEY_LENGTH } from "../../shared/schemas/answers.js";

export const saveAttemptSchema = z.object({
  // Клієнтський UUID цієї спроби проходження - генерується в браузері й
  // залишається стабільним для повторних autosave-викликів того самого
  // проходження (react-frontend, sessionStorage).
  sessionKey: z.string().min(1).max(MAX_SESSION_KEY_LENGTH),
  answers: answersSchema,
});

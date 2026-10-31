import { z } from "zod";
import {
  answersSchema,
  MAX_REACHED_QUESTION_IDS,
  MAX_SESSION_KEY_LENGTH,
} from "../../shared/schemas/answers.js";

export const saveAttemptSchema = z.object({
  // Клієнтський UUID цієї спроби проходження - генерується в браузері й
  // залишається стабільним для повторних autosave-викликів того самого
  // проходження (react-frontend, sessionStorage).
  sessionKey: z.string().min(1).max(MAX_SESSION_KEY_LENGTH),
  answers: answersSchema,
  // id питань, які клієнт реально показав респонденту за це проходження
  // (покроковий режим знає свій шлях точно). Якщо поле відсутнє - сервер
  // вважає досягнутими всі зараз видимі питання (режим "все на одній
  // сторінці", де видиме = показане). Невідомі id сервер відкидає.
  reachedQuestionIds: z.array(z.string().max(100)).max(MAX_REACHED_QUESTION_IDS).optional(),
});

import { z } from "zod";
import { answersSchema, MAX_SESSION_KEY_LENGTH } from "../../shared/schemas/answers.js";

export const submitResponseSchema = z.object({
  // Optional: if the respondent autosaved during the session (same sessionKey as PUT
  // /:shareId/attempt), the server marks that attempt completedAt, so the funnel counts
  // it as completed rather than abandoned.
  sessionKey: z.string().min(1).max(MAX_SESSION_KEY_LENGTH).optional(),
  answers: answersSchema,
  // Form language the respondent saw. Optional and checked softly (see
  // resolveResponseLanguage): an invalid language never blocks the response.
  language: z.string().max(35).optional(),
});

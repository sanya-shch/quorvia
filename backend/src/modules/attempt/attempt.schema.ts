import { z } from "zod";
import {
  answersSchema,
  MAX_REACHED_QUESTION_IDS,
  MAX_SESSION_KEY_LENGTH,
} from "../../shared/schemas/answers.js";

export const saveAttemptSchema = z.object({
  // Client UUID of this session: generated in the browser and stable across repeated
  // autosave calls of the same session (react-frontend, sessionStorage).
  sessionKey: z.string().min(1).max(MAX_SESSION_KEY_LENGTH),
  answers: answersSchema,
  // Ids of questions the client actually showed during this session (step-by-step mode
  // knows its path exactly). When absent the server treats every currently visible question
  // as reached (all-at-once mode, where visible = shown). Unknown ids are dropped.
  reachedQuestionIds: z.array(z.string().max(100)).max(MAX_REACHED_QUESTION_IDS).optional(),
});

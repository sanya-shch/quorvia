import { z } from "zod";
import { saveAttemptSchema } from "./attempt.schema.js";

export type SaveAttemptInput = z.infer<typeof saveAttemptSchema>;

export type SaveAttemptDto = {
  id: string;
  updatedAt: Date;
  // Set when the answers so far fall into a quota that is full: the respondent will be turned away
  // at the submit. `message` is the owner's text for the respondent (null: the standard one).
  quotaFull: { message: string | null } | null;
};

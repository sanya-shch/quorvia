import { z } from "zod";
import { QUOTA_LIMITS } from "@quorvia/shared-types";
import { conditionSchema } from "../form/form.schema.js";

const quotaFields = {
  name: z.string().trim().min(1).max(QUOTA_LIMITS.name),
  // Over the form's questions; that they exist and can be compared is checked against the form.
  condition: conditionSchema,
  limit: z.number().int().min(QUOTA_LIMITS.limit.min).max(QUOTA_LIMITS.limit.max),
  // Shown to a respondent who is turned away; empty or null means the standard text.
  message: z.string().trim().max(QUOTA_LIMITS.message).nullable().optional(),
};

export const createQuotaSchema = z.strictObject(quotaFields);

// Every field is optional, but not none: an empty PATCH is a mistake, not a no-op.
export const updateQuotaSchema = z
  .strictObject(quotaFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, "REQUEST_BODY_INVALID");

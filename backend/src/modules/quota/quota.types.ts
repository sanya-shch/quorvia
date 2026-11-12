import { z } from "zod";
import { createQuotaSchema, updateQuotaSchema } from "./quota.schema.js";

export type CreateQuotaInput = z.infer<typeof createQuotaSchema>;
export type UpdateQuotaInput = z.infer<typeof updateQuotaSchema>;

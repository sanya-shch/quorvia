import { Router } from "express";
import { authMiddleware } from "../../shared/middleware/auth.js";
import { validate } from "../../shared/middleware/validate.js";
import {
  createQuotaHandler,
  deleteQuotaHandler,
  listQuotasHandler,
  recountQuotaHandler,
  updateQuotaHandler,
} from "./quota.controller.js";
import { createQuotaSchema, updateQuotaSchema } from "./quota.schema.js";

const router = Router();

router.get("/:formId/quotas", authMiddleware, listQuotasHandler);
router.post("/:formId/quotas", authMiddleware, validate(createQuotaSchema), createQuotaHandler);
router.patch(
  "/:formId/quotas/:quotaId",
  authMiddleware,
  validate(updateQuotaSchema),
  updateQuotaHandler,
);
router.delete("/:formId/quotas/:quotaId", authMiddleware, deleteQuotaHandler);
router.post("/:formId/quotas/:quotaId/recount", authMiddleware, recountQuotaHandler);

export default router;

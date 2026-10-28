import { Router } from "express";
import { authMiddleware } from "../../shared/middleware/auth.js";
import { validate } from "../../shared/middleware/validate.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { createExportSchema } from "./export.schema.js";
import { exportLimiter } from "../../shared/middleware/rateLimiters.js";
import {
  createExportHandler,
  downloadExportHandler,
  getExportHandler,
  listExportsHandler,
} from "./export.controller.js";

const router = Router();

router.post(
  "/:formId/export",
  authMiddleware,
  exportLimiter,
  validate(createExportSchema),
  asyncHandler(createExportHandler),
);

router.get("/:formId/export", authMiddleware, asyncHandler(listExportsHandler));

router.get("/:formId/export/:jobId", authMiddleware, asyncHandler(getExportHandler));

router.get("/:formId/export/:jobId/download", authMiddleware, asyncHandler(downloadExportHandler));

export default router;

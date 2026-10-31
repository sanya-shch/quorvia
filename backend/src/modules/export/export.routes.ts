import { Router } from "express";
import { authMiddleware } from "../../shared/middleware/auth.js";
import { validate } from "../../shared/middleware/validate.js";
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
  createExportHandler,
);

router.get("/:formId/export", authMiddleware, listExportsHandler);

router.get("/:formId/export/:jobId", authMiddleware, getExportHandler);

router.get("/:formId/export/:jobId/download", authMiddleware, downloadExportHandler);

export default router;

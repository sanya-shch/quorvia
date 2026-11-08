import { Router } from "express";
import { authMiddleware } from "../../shared/middleware/auth.js";
import { fileUploadLimiter } from "../../shared/middleware/rateLimiters.js";
import { singleFileUpload } from "./file.upload.js";
import { deleteFileHandler, downloadFileHandler, uploadFileHandler } from "./file.controller.js";

// Mounted at /api/forms.
export const fileRoutes = Router();

// Anonymous: respondents have no account. The limiter runs before the multipart body is read.
fileRoutes.post("/:shareId/files", fileUploadLimiter, singleFileUpload, uploadFileHandler);
fileRoutes.delete("/:shareId/files/:fileId", fileUploadLimiter, deleteFileHandler);

// The form owner downloads a file of one of their responses.
fileRoutes.get("/:formId/responses/:responseId/files/:fileId", authMiddleware, downloadFileHandler);

import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ErrorCode, FILE_LIMITS } from "@quorvia/shared-types";
import { AppError } from "../../shared/middleware/errorHandler.js";

// Held in memory (at most maxBytes) because the content is inspected right away; nothing from the
// request is written to disk as it came.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_LIMITS.maxBytes, files: 1, fields: 2, parts: 3, fieldSize: 256 },
});

export const singleFileUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(new AppError(ErrorCode.FILE_TOO_LARGE, 413));
    }

    return next(new AppError(ErrorCode.FILE_UPLOAD_INVALID, 400));
  });
};

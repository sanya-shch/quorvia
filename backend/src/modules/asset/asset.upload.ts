import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ErrorCode, ASSET_LIMITS } from "@quorvia/shared-types";
import { AppError } from "../../shared/middleware/errorHandler.js";

// The file is held in memory (at most maxBytes) because it is decoded and re-encoded
// right away; nothing from the request is ever written to disk as is.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ASSET_LIMITS.maxBytes, files: 1, fields: 2, parts: 3, fieldSize: 64 },
});

// Maps multer's own errors to stable API codes instead of a generic 500.
export const singleImageUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(new AppError(ErrorCode.ASSET_TOO_LARGE, 413));
    }

    return next(new AppError(ErrorCode.ASSET_UPLOAD_INVALID, 400));
  });
};

import type { Request, Response } from "express";
import { z } from "zod";
import { ErrorCode, type UploadedFileDto } from "@quorvia/shared-types";
import { AppError } from "../../shared/middleware/errorHandler.js";
import type { AuthLocals } from "../../shared/middleware/auth.js";
import { MAX_SESSION_KEY_LENGTH } from "../../shared/schemas/answers.js";
import { attachmentDisposition, contentTypeFor } from "./file.name.js";
import { deleteUnattachedFile, getOwnerFile, uploadResponseFile } from "./file.service.js";

const sessionKeySchema = z.string().min(1).max(MAX_SESSION_KEY_LENGTH);

const uploadBodySchema = z.object({
  sessionKey: sessionKeySchema,
  questionId: z.string().min(1).max(100),
});

export const uploadFileHandler = async (
  req: Request<{ shareId: string }>,
  res: Response<UploadedFileDto>,
) => {
  const body = uploadBodySchema.safeParse(req.body ?? {});

  if (!req.file || !body.success) throw new AppError(ErrorCode.FILE_UPLOAD_INVALID, 400);

  const file = await uploadResponseFile({
    shareId: req.params.shareId,
    sessionKey: body.data.sessionKey,
    questionId: body.data.questionId,
    rawName: req.file.originalname,
    data: req.file.buffer,
  });

  res.status(201).json(file);
};

export const deleteFileHandler = async (
  req: Request<{ shareId: string; fileId: string }>,
  res: Response,
) => {
  const sessionKey = sessionKeySchema.safeParse(req.query.sessionKey);

  if (!sessionKey.success) throw new AppError(ErrorCode.FILE_UPLOAD_INVALID, 400);

  await deleteUnattachedFile(req.params.shareId, sessionKey.data, req.params.fileId);

  res.status(204).end();
};

export const downloadFileHandler = async (
  req: Request<{ formId: string; responseId: string; fileId: string }>,
  res: Response,
) => {
  const userId = (res.locals as AuthLocals).userId;
  const { data, name, mime } = await getOwnerFile(
    req.params.formId,
    req.params.responseId,
    req.params.fileId,
    userId,
  );

  res.set({
    "Content-Type": contentTypeFor(mime),
    "Content-Length": String(data.length),
    // Always a download, never rendered in the browser, and the type is never guessed.
    "Content-Disposition": attachmentDisposition(name),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    // Private respondent data: nothing may keep a copy.
    "Cache-Control": "private, no-store",
  });

  res.send(data);
};

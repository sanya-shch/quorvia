import type { Prisma } from "@prisma/client";
import { ErrorCode, FILE_LIMITS, type FileMimeType, type UploadedFileDto } from "@quorvia/shared-types";
import { prisma } from "../../prisma/prisma.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { newBinaryStorageKey, type Storage } from "../asset/asset.storage.js";
import { inspectFile } from "./file.content.js";
import { sanitizeFileName } from "./file.name.js";
import { defaultFileStorage } from "./file.storage.js";

const toDto = (file: { id: string; originalName: string; size: number; mime: string }): UploadedFileDto => ({
  id: file.id,
  name: file.originalName,
  size: file.size,
  mime: file.mime as FileMimeType,
});

export type UploadInput = {
  shareId: string;
  sessionKey: string;
  questionId: string;
  rawName: string | undefined;
  data: Buffer;
};

/**
 * Anonymous upload for a FILE question of a published form. Everything that bounds abuse is checked
 * here: the question must exist and be a FILE question, a session may hold only a few pending files
 * (per question and in total), and the whole form has a storage quota. The file is created
 * unattached; submitting the response attaches it (attachFilesToResponse).
 *
 * The limits are soft (concurrent uploads can overshoot them by a few files): their point is that a
 * form cannot collect unbounded data, not exact accounting.
 */
export const uploadResponseFile = async (
  { shareId, sessionKey, questionId, rawName, data }: UploadInput,
  storage: Storage = defaultFileStorage,
): Promise<UploadedFileDto> => {
  const form = await prisma.form.findUnique({
    where: { shareId },
    select: {
      id: true,
      isPublished: true,
      questions: { where: { id: questionId }, select: { type: true, config: true } },
    },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (!form.isPublished) throw new AppError(ErrorCode.FORM_NOT_PUBLISHED, 400);

  const question = form.questions[0];

  // The same answer for an unknown question and for one of another type: nothing is revealed.
  if (!question || question.type !== "FILE") throw new AppError(ErrorCode.FILE_UPLOAD_INVALID, 400);

  const maxFiles = Math.min(
    (question.config as { maxFiles?: number } | null)?.maxFiles ?? 1,
    FILE_LIMITS.maxFilesPerQuestion,
  );

  const pending = await prisma.responseFile.findMany({
    where: { formId: form.id, sessionKey, responseId: null },
    select: { questionId: true },
  });

  if (
    pending.length >= FILE_LIMITS.maxFilesPerSession ||
    pending.filter((file) => file.questionId === questionId).length >= maxFiles
  ) {
    throw new AppError(ErrorCode.FILE_LIMIT_REACHED, 409);
  }

  const inspected = await inspectFile(data);

  const used = await prisma.responseFile.aggregate({
    where: { formId: form.id },
    _sum: { size: true },
  });

  if ((used._sum.size ?? 0) + inspected.data.length > FILE_LIMITS.maxBytesPerForm) {
    throw new AppError(ErrorCode.FILE_QUOTA_EXCEEDED, 413);
  }

  const storageKey = newBinaryStorageKey();

  await storage.put(storageKey, inspected.data);

  try {
    const file = await prisma.responseFile.create({
      data: {
        formId: form.id,
        questionId,
        sessionKey,
        originalName: sanitizeFileName(rawName, inspected.mime),
        mime: inspected.mime,
        size: inspected.data.length,
        storageKey,
      },
    });

    return toDto(file);
  } catch (err) {
    await storage.remove(storageKey).catch(() => undefined);
    throw err;
  }
};

// A respondent removes a file they uploaded in this session and have not submitted yet.
export const deleteUnattachedFile = async (
  shareId: string,
  sessionKey: string,
  fileId: string,
  storage: Storage = defaultFileStorage,
): Promise<void> => {
  const file = await prisma.responseFile.findFirst({
    where: { id: fileId, sessionKey, responseId: null, form: { shareId } },
  });

  if (!file) throw new AppError(ErrorCode.FILE_NOT_FOUND, 404);

  await storage.remove(file.storageKey);
  await prisma.responseFile.deleteMany({ where: { id: file.id, responseId: null } });
};

type SubmittedQuestion = { id: string; type: string };

// File ids the respondent claims for each visible FILE question: [{ id, questionId }].
export const collectFileClaims = (
  questions: SubmittedQuestion[],
  answers: Record<string, unknown>,
  visibleQuestionIds: Set<string>,
): { id: string; questionId: string }[] =>
  questions
    .filter((q) => q.type === "FILE" && visibleQuestionIds.has(q.id))
    .flatMap((q) => {
      const value = answers[q.id];

      return Array.isArray(value)
        ? value.flatMap((id) => (typeof id === "string" ? [{ id, questionId: q.id }] : []))
        : [];
    });

const invalidFiles = (questionId: string) =>
  new AppError(ErrorCode.RESPONSE_VALIDATION_FAILED, 400, [
    { field: questionId, message: ErrorCode.VALIDATION_FILES_INVALID },
  ]);

/**
 * Attaches the claimed files to the new response, inside the transaction that creates it. A claim
 * is accepted only for a file that was uploaded to THIS form, by THIS session, for THAT question,
 * and is not attached yet; anything else fails the whole submit, so a response can never point at
 * someone else's file. The conditional UPDATE makes a file attachable exactly once even when two
 * submits race.
 */
export const attachFilesToResponse = async (
  tx: Prisma.TransactionClient,
  params: {
    formId: string;
    responseId: string;
    sessionKey: string | undefined;
    claims: { id: string; questionId: string }[];
  },
): Promise<void> => {
  const { formId, responseId, sessionKey, claims } = params;

  if (claims.length === 0) return;
  if (!sessionKey) throw invalidFiles(claims[0]!.questionId);

  const ids = claims.map((claim) => claim.id);

  if (new Set(ids).size !== ids.length) throw invalidFiles(claims[0]!.questionId);

  const owned = await tx.responseFile.findMany({
    where: { id: { in: ids }, formId, sessionKey, responseId: null },
    select: { id: true, questionId: true },
  });
  const questionOf = new Map(owned.map((file) => [file.id, file.questionId]));

  for (const claim of claims) {
    if (questionOf.get(claim.id) !== claim.questionId) throw invalidFiles(claim.questionId);
  }

  const { count } = await tx.responseFile.updateMany({
    where: { id: { in: ids }, formId, sessionKey, responseId: null },
    data: { responseId },
  });

  if (count !== ids.length) throw invalidFiles(claims[0]!.questionId);
};

// For the form owner: a file of one of the form's responses.
export const getOwnerFile = async (
  formId: string,
  responseId: string,
  fileId: string,
  userId: string,
  storage: Storage = defaultFileStorage,
) => {
  const form = await prisma.form.findUnique({ where: { id: formId }, select: { userId: true } });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  const file = await prisma.responseFile.findFirst({ where: { id: fileId, formId, responseId } });
  const data = file ? await storage.get(file.storageKey) : null;

  if (!file || !data) throw new AppError(ErrorCode.FILE_NOT_FOUND, 404);

  return { data, name: file.originalName, mime: file.mime };
};

export const removeFileObjects = async (
  storageKeys: string[],
  storage: Storage = defaultFileStorage,
): Promise<void> => {
  await Promise.all(storageKeys.map((key) => storage.remove(key).catch(() => false)));
};

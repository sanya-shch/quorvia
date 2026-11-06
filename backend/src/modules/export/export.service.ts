import fs from "node:fs/promises";
import { prisma } from "../../prisma/prisma.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { ErrorCode } from "@quorvia/shared-types";
import { exportQueue } from "./export.queue.js";
import { EXPORTS_DIR, resolveExportPath } from "./export.paths.js";
import { ExportJobDto, ExportQueueJobData } from "./export.types.js";
import { ExportFormat } from "@prisma/client";

/**
 * How many exports of one user may be queued/running at once. Together with the endpoint
 * rate limit it keeps one account from clogging the BullMQ queue and the worker with heavy
 * PDF/Excel jobs. Jobs older than ACTIVE_JOB_WINDOW_MS are not counted, otherwise a "stuck"
 * PENDING (for example the worker was down) would block the user forever.
 */
export const MAX_ACTIVE_EXPORTS_PER_USER = 3;
const ACTIVE_JOB_WINDOW_MS = 15 * 60 * 1000;

// Re-export: the worker and tests import EXPORTS_DIR from here.
export { EXPORTS_DIR };

const toDto = (job: {
  id: string;
  formId: string;
  format: ExportFormat;
  status: ExportJobDto["status"];
  fileName: string | null;
  responseCount: number | null;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): ExportJobDto => ({
  id: job.id,
  formId: job.formId,
  format: job.format,
  status: job.status,
  fileName: job.fileName,
  responseCount: job.responseCount,
  error: job.error,
  createdAt: job.createdAt,
  completedAt: job.completedAt,
});

const assertFormOwnership = async (formId: string, userId: string) => {
  const form = await prisma.form.findUnique({ where: { id: formId } });

  if (!form) {
    throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  }

  if (form.userId !== userId) {
    throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);
  }

  return form;
};

export const createExportJob = async (
  formId: string,
  userId: string,
  format: ExportFormat,
): Promise<ExportJobDto> => {
  await assertFormOwnership(formId, userId);

  const activeJobs = await prisma.exportJob.count({
    where: {
      userId,
      status: { in: ["PENDING", "PROCESSING"] },
      createdAt: { gt: new Date(Date.now() - ACTIVE_JOB_WINDOW_MS) },
    },
  });

  if (activeJobs >= MAX_ACTIVE_EXPORTS_PER_USER) {
    throw new AppError(ErrorCode.RATE_LIMITED, 429);
  }

  const job = await prisma.exportJob.create({
    data: {
      formId,
      userId,
      format,
      status: "PENDING",
    },
  });

  const queueData: ExportQueueJobData = { exportJobId: job.id };

  await exportQueue.add("generate", queueData, { jobId: job.id });

  return toDto(job);
};

export const listExportJobs = async (formId: string, userId: string): Promise<ExportJobDto[]> => {
  await assertFormOwnership(formId, userId);

  const jobs = await prisma.exportJob.findMany({
    where: { formId },
    orderBy: { createdAt: "desc" },
  });

  return jobs.map(toDto);
};

export const getExportJob = async (
  formId: string,
  userId: string,
  jobId: string,
): Promise<ExportJobDto> => {
  await assertFormOwnership(formId, userId);

  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });

  if (!job || job.formId !== formId) {
    throw new AppError(ErrorCode.EXPORT_JOB_NOT_FOUND, 404);
  }

  return toDto(job);
};

export const getExportFileForDownload = async (formId: string, userId: string, jobId: string) => {
  await assertFormOwnership(formId, userId);

  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });

  if (!job || job.formId !== formId) {
    throw new AppError(ErrorCode.EXPORT_JOB_NOT_FOUND, 404);
  }

  if (job.status !== "COMPLETED" || !job.filePath || !job.fileName) {
    throw new AppError(ErrorCode.EXPORT_NOT_READY, 409);
  }

  const absolutePath = resolveExportPath(job.filePath);

  if (!absolutePath) {
    throw new AppError(ErrorCode.EXPORT_FILE_MISSING, 410);
  }

  try {
    await fs.access(absolutePath);
  } catch {
    throw new AppError(ErrorCode.EXPORT_FILE_MISSING, 410);
  }

  return { absolutePath, fileName: job.fileName };
};

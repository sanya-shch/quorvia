import path from "node:path";
import fs from "node:fs/promises";
import { Job, UnrecoverableError, Worker } from "bullmq";
import { redisConnection } from "../../shared/queue/redisConnection.js";
import { QueueNames } from "../../shared/queue/queueNames.js";
import { prisma } from "../../prisma/prisma.js";
import { exportersByFormat } from "./exporters/index.js";
import { EXPORTS_DIR } from "./export.service.js";
import { ExportQueueJobData } from "./export.types.js";

/**
 * Верхня межа кількості відповідей в одному експорті: воркер вантажить їх
 * усі в пам'ять (і ще раз - при побудові PDF/Excel), тож форма з мільйоном
 * відповідей інакше валить процес по OOM. Потрібен стрімінг/пагінація
 * експортерів - тоді ліміт можна прибрати.
 */
export const MAX_EXPORT_RESPONSES = 20_000;

export const EXPORT_ERROR_FAILED = "EXPORT_FAILED";
export const EXPORT_ERROR_TOO_LARGE = "EXPORT_TOO_LARGE";

class ExportTooLargeError extends UnrecoverableError {}

export const processExportJob = async (job: Job<ExportQueueJobData>) => {
  const { exportJobId } = job.data;

  const exportJob = await prisma.exportJob.findUnique({
    where: { id: exportJobId },
  });

  if (!exportJob) {
    return;
  }

  await prisma.exportJob.update({
    where: { id: exportJobId },
    data: { status: "PROCESSING" },
  });

  try {
    const form = await prisma.form.findUniqueOrThrow({
      where: { id: exportJob.formId },
      include: {
        questions: { orderBy: { order: "asc" } },
        responses: { orderBy: { createdAt: "asc" }, take: MAX_EXPORT_RESPONSES + 1 },
      },
    });

    if (form.responses.length > MAX_EXPORT_RESPONSES) {
      throw new ExportTooLargeError(`More than ${MAX_EXPORT_RESPONSES} responses`);
    }

    const exporter = exportersByFormat[exportJob.format];
    const file = await exporter({
      form: {
        id: form.id,
        title: form.title,
        description: form.description,
      },
      questions: form.questions,
      responses: form.responses,
    });

    await fs.mkdir(EXPORTS_DIR, { recursive: true });

    const storedFileName = `${exportJobId}-${file.fileName}`;
    await fs.writeFile(path.join(EXPORTS_DIR, storedFileName), file.buffer);

    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: "COMPLETED",
        filePath: storedFileName,
        fileName: file.fileName,
        responseCount: form.responses.length,
        completedAt: new Date(),
        error: null,
      },
    });
  } catch (err) {
    // У БД (і далі в API/UI) потрапляє лише стабільний код, а не сире
    // err.message - у ньому можуть бути шляхи, SQL чи інші внутрішні
    // деталі. Повна помилка лишається в логах воркера.
    console.error(`[export-worker] job ${exportJobId} error:`, err);

    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: "FAILED",
        error: err instanceof ExportTooLargeError ? EXPORT_ERROR_TOO_LARGE : EXPORT_ERROR_FAILED,
      },
    });

    throw err;
  }
};

export const createExportWorker = () =>
  new Worker<ExportQueueJobData>(QueueNames.EXPORT, processExportJob, {
    connection: redisConnection,
    concurrency: 3,
  });

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../prisma/prisma.js";
import { EXPORTS_DIR, resolveExportPath } from "../export/export.paths.js";

/**
 * Періодичне прибирання даних, що інакше ростуть безкінечно: готові файли
 * експортів (диск) та покинуті чернетки проходжень (таблиця ResponseAttempt,
 * яку autosave пише найчастіше). Усе робиться порціями: ні список id, ні
 * видалення не повинні бути розміром з усю таблицю.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 500;

type CleanupOptions = {
  retentionDays: number;
  /** Для тестів: "поточний" час. */
  now?: Date;
  batchSize?: number;
};

const thresholdFor = (now: Date, retentionDays: number) =>
  new Date(now.getTime() - retentionDays * DAY_MS);

/** Видаляє файл; true - якщо він існував. Відсутній файл - не помилка. */
const removeFile = async (absolutePath: string | null): Promise<boolean> => {
  if (!absolutePath) return false;

  try {
    await fs.unlink(absolutePath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
};

/**
 * Прострочені експорти: спершу файл, потім запис. Якщо видалення запису
 * впаде після видалення файлу, запис лишиться без файлу (завантаження дасть
 * 410) і буде прибраний наступним запуском; у зворотному порядку файл
 * осиротів би.
 */
export const cleanupExpiredExports = async ({
  retentionDays,
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
  exportsDir = EXPORTS_DIR,
}: CleanupOptions & { exportsDir?: string }) => {
  const threshold = thresholdFor(now, retentionDays);
  let jobs = 0;
  let files = 0;

  for (;;) {
    const batch = await prisma.exportJob.findMany({
      where: { createdAt: { lt: threshold } },
      select: { id: true, filePath: true },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    if (batch.length === 0) break;

    for (const job of batch) {
      if (job.filePath && (await removeFile(resolveExportPath(job.filePath, exportsDir)))) {
        files++;
      }
    }

    await prisma.exportJob.deleteMany({ where: { id: { in: batch.map((j) => j.id) } } });
    jobs += batch.length;

    if (batch.length < batchSize) break;
  }

  return { jobs, files };
};

/** Файли експортів мають ім'я `<uuid завдання>-<назва>`; чужі файли не чіпаємо. */
const EXPORT_FILE_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i;

/**
 * Файли без запису в БД: видалення форми каскадно прибирає ExportJob, але не
 * файл на диску; збій між записом файлу й запису в БД теж лишає сироту.
 * Беремо лише файли старші за retention - свіжий файл може бути щойно
 * записаний воркером, а запис про нього ще не оновлений.
 */
export const cleanupOrphanExportFiles = async ({
  retentionDays,
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
  exportsDir = EXPORTS_DIR,
}: CleanupOptions & { exportsDir?: string }) => {
  const threshold = thresholdFor(now, retentionDays);

  let names: string[];
  try {
    names = await fs.readdir(exportsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { files: 0 };
    throw err;
  }

  const candidates: { id: string; absolutePath: string }[] = [];

  for (const name of names) {
    const id = EXPORT_FILE_NAME.exec(name)?.[1];
    if (!id) continue;

    const absolutePath = path.join(exportsDir, name);
    const stat = await fs.stat(absolutePath);
    if (stat.isFile() && stat.mtime < threshold) candidates.push({ id, absolutePath });
  }

  let removed = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const chunk = candidates.slice(i, i + batchSize);
    const known = await prisma.exportJob.findMany({
      where: { id: { in: chunk.map((c) => c.id) } },
      select: { id: true },
    });
    const knownIds = new Set(known.map((j) => j.id));

    for (const candidate of chunk) {
      if (!knownIds.has(candidate.id) && (await removeFile(candidate.absolutePath))) removed++;
    }
  }

  return { files: removed };
};

/**
 * Покинуті проходження: незавершені, що почались раніше за retention.
 * Завершені не видаляються ніколи - без них funnel втратив би завершення.
 *
 * Наслідок, який варто знати: видалені покинуті проходження більше не
 * входять у totalAttempts, тож completionRate за старий період зростає.
 * retentionDays = 0 вимикає прибирання. Фільтр - за startedAt (незмінний,
 * є індекс), а не updatedAt, який змінює кожен autosave.
 */
export const cleanupStaleAttempts = async ({
  retentionDays,
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
}: CleanupOptions) => {
  if (retentionDays <= 0) return { attempts: 0 };

  const threshold = thresholdFor(now, retentionDays);
  let attempts = 0;

  for (;;) {
    const batch = await prisma.responseAttempt.findMany({
      where: { completedAt: null, startedAt: { lt: threshold } },
      select: { id: true },
      take: batchSize,
    });

    if (batch.length === 0) break;

    await prisma.responseAttempt.deleteMany({ where: { id: { in: batch.map((a) => a.id) } } });
    attempts += batch.length;

    if (batch.length < batchSize) break;
  }

  return { attempts };
};

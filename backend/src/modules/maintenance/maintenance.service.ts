import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../prisma/prisma.js";
import { EXPORTS_DIR, resolveExportPath } from "../export/export.paths.js";

/**
 * Periodic cleanup of data that would otherwise grow forever: finished export files (disk)
 * and abandoned session drafts (the ResponseAttempt table, which autosave writes most
 * often). Everything is done in batches: neither the id list nor the delete should be the
 * size of the whole table.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 500;

type CleanupOptions = {
  retentionDays: number;
  // For tests: the "current" time.
  now?: Date;
  batchSize?: number;
};

const thresholdFor = (now: Date, retentionDays: number) =>
  new Date(now.getTime() - retentionDays * DAY_MS);

// Deletes a file; true if it existed. A missing file is not an error.
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

// Expired exports: the file first, then the row. If deleting the row fails after the file
// was removed, the row stays without a file (the download answers 410) and the next run
// removes it; the reverse order would orphan the file.
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

// Export files are named `<job uuid>-<name>`; files that do not match are left alone.
const EXPORT_FILE_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i;

/**
 * Files without a DB row: deleting a form cascades to ExportJob but not to the file on
 * disk, and a failure between writing the file and the row also leaves an orphan. Only files
 * older than the retention are taken: a fresh file may have just been written by the worker
 * while its row is not recorded yet.
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
 * Abandoned sessions: unfinished ones that started before the retention. Completed ones
 * are never deleted, the funnel would lose its completions without them.
 *
 * A consequence worth knowing: deleted abandoned sessions no longer count in totalAttempts,
 * so completionRate for the old period goes up. retentionDays = 0 disables cleanup. The
 * filter uses startedAt (immutable, indexed), not updatedAt, which every autosave changes.
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

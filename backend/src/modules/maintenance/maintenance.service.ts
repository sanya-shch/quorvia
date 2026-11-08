import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../prisma/prisma.js";
import { EXPORTS_DIR, resolveExportPath } from "../export/export.paths.js";
import { defaultStorage, type Storage } from "../asset/asset.storage.js";
import { defaultFileStorage } from "../file/file.storage.js";

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

// Removes objects older than the threshold that the database knows nothing about, in batches.
// `findKnown` returns which of the given keys have a row. Returns how many objects were removed.
const sweepUnknownObjects = async (
  storage: Storage,
  threshold: Date,
  batchSize: number,
  findKnown: (keys: string[]) => Promise<Set<string>>,
): Promise<number> => {
  const candidates: string[] = [];

  for await (const object of storage.list()) {
    if (object.modifiedAt < threshold) candidates.push(object.key);
  }

  let removed = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const chunk = candidates.slice(i, i + batchSize);
    const known = await findKnown(chunk);

    for (const key of chunk) {
      if (!known.has(key) && (await storage.remove(key))) removed++;
    }
  }

  return removed;
};

// Ids among the given option-image assets that some IMAGE_CHOICE question still points at. The
// pictures live inside the options JSON of questions, so there is no relation to query.
const referencedOptionImages = async (
  assets: { id: string; kind: string; formId: string }[],
): Promise<Set<string>> => {
  const optionImages = assets.filter((asset) => asset.kind === "OPTION_IMAGE");

  if (optionImages.length === 0) return new Set();

  const questions = await prisma.question.findMany({
    where: {
      type: "IMAGE_CHOICE",
      formId: { in: [...new Set(optionImages.map((asset) => asset.formId))] },
    },
    select: { options: true },
  });
  const referenced = new Set<string>();

  for (const question of questions) {
    if (!Array.isArray(question.options)) continue;

    for (const option of question.options as { imageAssetId?: unknown }[]) {
      if (typeof option?.imageAssetId === "string") referenced.add(option.imageAssetId);
    }
  }

  return referenced;
};

/**
 * Uploaded images nobody uses, in two directions:
 * - rows that are neither the logo of a form nor a picture of an IMAGE_CHOICE option (replaced or
 *   removed images, uploads the author never saved), together with their files;
 * - files without a row (the form was deleted and the best-effort removal failed, or the
 *   process died between writing the file and the row).
 *
 * Only things older than the grace period are touched: a fresh upload may simply not be
 * attached yet because the author has not saved the form.
 */
export const cleanupOrphanAssets = async ({
  graceMs = DAY_MS,
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
  storage = defaultStorage,
}: {
  graceMs?: number;
  now?: Date;
  batchSize?: number;
  storage?: Storage;
} = {}) => {
  const threshold = new Date(now.getTime() - graceMs);
  let rows = 0;
  let files = 0;
  let lastId: string | undefined;

  // Keyset by id: batches may contain assets that are kept, so "fetch again after deleting" would
  // never move past them.
  for (;;) {
    const batch = await prisma.asset.findMany({
      where: {
        createdAt: { lt: threshold },
        logoOf: { none: {} },
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      select: { id: true, storageKey: true, kind: true, formId: true },
      orderBy: { id: "asc" },
      take: batchSize,
    });

    if (batch.length === 0) break;

    lastId = batch[batch.length - 1]!.id;

    const referenced = await referencedOptionImages(batch);
    const unused = batch.filter((asset) => !referenced.has(asset.id));

    // The file first, then the row: if deleting the row fails, the next run retries it,
    // the reverse order would leave the file orphaned.
    for (const asset of unused) {
      if (await storage.remove(asset.storageKey)) files++;
    }

    if (unused.length > 0) {
      await prisma.asset.deleteMany({ where: { id: { in: unused.map((a) => a.id) } } });
      rows += unused.length;
    }

    if (batch.length < batchSize) break;
  }

  files += await sweepUnknownObjects(storage, threshold, batchSize, async (keys) => {
    const known = await prisma.asset.findMany({
      where: { storageKey: { in: keys } },
      select: { storageKey: true },
    });

    return new Set(known.map((asset) => asset.storageKey));
  });

  return { rows, files };
};

/**
 * Respondent uploads nobody will ever read: files that were uploaded but never attached to a
 * submitted response (the respondent left, removed the question, or the question was hidden by a
 * later answer), and files without a row. A longer grace than for images: a respondent may spend
 * a long time on a form between uploading and submitting.
 */
export const cleanupOrphanResponseFiles = async ({
  graceMs = 2 * DAY_MS,
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
  storage = defaultFileStorage,
}: {
  graceMs?: number;
  now?: Date;
  batchSize?: number;
  storage?: Storage;
} = {}) => {
  const threshold = new Date(now.getTime() - graceMs);
  let rows = 0;
  let files = 0;

  for (;;) {
    const batch = await prisma.responseFile.findMany({
      where: { responseId: null, createdAt: { lt: threshold } },
      select: { id: true, storageKey: true },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    if (batch.length === 0) break;

    for (const file of batch) {
      if (await storage.remove(file.storageKey)) files++;
    }

    // responseId: null again: a file attached in the meantime must survive.
    const { count } = await prisma.responseFile.deleteMany({
      where: { id: { in: batch.map((file) => file.id) }, responseId: null },
    });
    rows += count;

    if (batch.length < batchSize) break;
  }

  files += await sweepUnknownObjects(storage, threshold, batchSize, async (keys) => {
    const known = await prisma.responseFile.findMany({
      where: { storageKey: { in: keys } },
      select: { storageKey: true },
    });

    return new Set(known.map((file) => file.storageKey));
  });

  return { rows, files };
};

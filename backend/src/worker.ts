import "dotenv/config";
import { validateEnv } from "./config/env.js";

const env = validateEnv();

const { createExportWorker } = await import("./modules/export/export.worker.js");
const { cleanupRefreshTokens } = await import("./modules/auth/auth.service.js");
const { cleanupExpiredExports, cleanupOrphanExportFiles, cleanupStaleAttempts } = await import(
  "./modules/maintenance/maintenance.service.js"
);
const { startMaintenance } = await import("./modules/maintenance/maintenance.scheduler.js");

const exportWorker = createExportWorker();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const maintenance = startMaintenance([
  {
    // Прострочені/відкликані refresh-токени.
    name: "token-cleanup",
    intervalMs: HOUR_MS,
    run: async () => {
      const count = await cleanupRefreshTokens();
      return count > 0 ? `видалено refresh-токенів: ${count}` : undefined;
    },
  },
  {
    // Готові експорти старші за EXPORT_RETENTION_DAYS + файли без запису в БД.
    name: "export-cleanup",
    intervalMs: DAY_MS,
    run: async () => {
      const expired = await cleanupExpiredExports({ retentionDays: env.EXPORT_RETENTION_DAYS });
      const orphans = await cleanupOrphanExportFiles({ retentionDays: env.EXPORT_RETENTION_DAYS });
      const files = expired.files + orphans.files;

      return expired.jobs + files > 0
        ? `видалено експортів: ${expired.jobs}, файлів: ${files}`
        : undefined;
    },
  },
  {
    // Покинуті (незавершені) проходження старші за ATTEMPT_RETENTION_DAYS.
    name: "attempt-cleanup",
    intervalMs: DAY_MS,
    run: async () => {
      const { attempts } = await cleanupStaleAttempts({
        retentionDays: env.ATTEMPT_RETENTION_DAYS,
      });
      return attempts > 0 ? `видалено покинутих проходжень: ${attempts}` : undefined;
    },
  },
]);

exportWorker.on("completed", (job) => {
  console.log(`[export-worker] job ${job.id} completed`);
});

exportWorker.on("failed", (job, err) => {
  console.error(`[export-worker] job ${job?.id} failed:`, err.message);
});

console.log('Export worker запущено, очікую завдання з черги "export"...');

const shutdown = async () => {
  maintenance.stop();
  console.log("Завершення роботи export worker...");
  await exportWorker.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

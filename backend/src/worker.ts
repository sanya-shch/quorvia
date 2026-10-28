import "dotenv/config";
import { validateEnv } from "./config/env.js";

validateEnv();

const { createExportWorker } = await import("./modules/export/export.worker.js");

const { cleanupRefreshTokens } = await import("./modules/auth/auth.service.js");

const exportWorker = createExportWorker();

// Періодичне прибирання прострочених/відкликаних refresh-токенів.
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const runTokenCleanup = () =>
  cleanupRefreshTokens()
    .then((count) => {
      if (count > 0) console.log(`[token-cleanup] видалено refresh-токенів: ${count}`);
    })
    .catch((err) => console.error("[token-cleanup] помилка:", err));

void runTokenCleanup();
const cleanupTimer = setInterval(runTokenCleanup, CLEANUP_INTERVAL_MS);

exportWorker.on("completed", (job) => {
  console.log(`[export-worker] job ${job.id} completed`);
});

exportWorker.on("failed", (job, err) => {
  console.error(`[export-worker] job ${job?.id} failed:`, err.message);
});

console.log('Export worker запущено, очікую завдання з черги "export"...');

const shutdown = async () => {
  clearInterval(cleanupTimer);
  console.log("Завершення роботи export worker...");
  await exportWorker.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/**
 * A minimal scheduler for background cleanup tasks. All tasks are idempotent (they delete
 * "everything older than the threshold"), so several worker instances running them in
 * parallel only duplicate work instead of causing harm; a BullMQ queue would be needless
 * complexity here.
 *
 * Guarantees: a failure in one task does not stop the others or later runs; a run does not
 * overlap a previous one that is still going.
 */
export type MaintenanceTask = {
  name: string;
  intervalMs: number;
  // May return a short summary for the log (an empty string/undefined logs nothing).
  run: () => Promise<string | void>;
};

type Logger = {
  log: (message: string) => void;
  error: (message: string, err: unknown) => void;
};

export const startMaintenance = (
  tasks: MaintenanceTask[],
  logger: Logger = { log: console.log, error: console.error },
) => {
  const running = new Set<string>();

  const runTask = async (task: MaintenanceTask) => {
    if (running.has(task.name)) return;
    running.add(task.name);

    try {
      const summary = await task.run();
      if (summary) logger.log(`[${task.name}] ${summary}`);
    } catch (err) {
      logger.error(`[${task.name}] помилка:`, err);
    } finally {
      running.delete(task.name);
    }
  };

  const timers = tasks.map((task) => {
    void runTask(task); // first run immediately, without waiting for the interval
    return setInterval(() => void runTask(task), task.intervalMs);
  });

  return {
    stop: () => timers.forEach((timer) => clearInterval(timer)),
  };
};

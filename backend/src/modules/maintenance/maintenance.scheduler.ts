/**
 * Мінімальний планувальник фонових задач прибирання. Усі задачі
 * ідемпотентні (видаляють "все старіше за поріг"), тому кілька екземплярів
 * воркера, що запускають їх паралельно, лише дублюють роботу, а не шкодять -
 * окрема черга BullMQ заради цього була б зайвою складністю.
 *
 * Гарантії: помилка однієї задачі не зупиняє інші й наступні запуски; запуск
 * не накладається на попередній, що ще триває.
 */
export type MaintenanceTask = {
  name: string;
  intervalMs: number;
  /** Може повернути короткий підсумок для логу (порожній рядок/undefined - нічого не логуємо). */
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
    void runTask(task); // перший запуск одразу, не чекаючи інтервалу
    return setInterval(() => void runTask(task), task.intervalMs);
  });

  return {
    stop: () => timers.forEach((timer) => clearInterval(timer)),
  };
};

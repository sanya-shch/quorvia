import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMaintenance } from "./maintenance.scheduler.js";

describe("startMaintenance", () => {
  const logger = { log: vi.fn(), error: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    logger.log.mockReset();
    logger.error.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("запускає кожну задачу одразу, не чекаючи інтервалу", async () => {
    const run = vi.fn().mockResolvedValue(undefined);

    const { stop } = startMaintenance([{ name: "a", intervalMs: 1000, run }], logger);
    await vi.advanceTimersByTimeAsync(0);

    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it("повторює задачу з її інтервалом, у кожної задачі свій", async () => {
    const fast = vi.fn().mockResolvedValue(undefined);
    const slow = vi.fn().mockResolvedValue(undefined);

    const { stop } = startMaintenance(
      [
        { name: "fast", intervalMs: 1000, run: fast },
        { name: "slow", intervalMs: 5000, run: slow },
      ],
      logger,
    );
    await vi.advanceTimersByTimeAsync(5000);

    expect(fast).toHaveBeenCalledTimes(6); // старт + 5 тактів
    expect(slow).toHaveBeenCalledTimes(2); // старт + 1 такт
    stop();
  });

  it("логує підсумок задачі й мовчить, якщо підсумку немає", async () => {
    const { stop } = startMaintenance(
      [
        { name: "with-summary", intervalMs: 1000, run: async () => "видалено: 3" },
        { name: "silent", intervalMs: 1000, run: async () => undefined },
      ],
      logger,
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith("[with-summary] видалено: 3");
    stop();
  });

  it("помилка однієї задачі логується й не зупиняє ні інші задачі, ні її наступні запуски", async () => {
    const boom = new Error("db down");
    const failing = vi.fn().mockRejectedValueOnce(boom).mockResolvedValue(undefined);
    const healthy = vi.fn().mockResolvedValue(undefined);

    const { stop } = startMaintenance(
      [
        { name: "failing", intervalMs: 1000, run: failing },
        { name: "healthy", intervalMs: 1000, run: healthy },
      ],
      logger,
    );
    await vi.advanceTimersByTimeAsync(1000);

    expect(logger.error).toHaveBeenCalledWith("[failing] помилка:", boom);
    expect(failing).toHaveBeenCalledTimes(2); // після збою наступний запуск відбувся
    expect(healthy).toHaveBeenCalledTimes(2);
    stop();
  });

  it("не запускає задачу повторно, поки попередній запуск ще триває", async () => {
    let release!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));

    const { stop } = startMaintenance([{ name: "slow", intervalMs: 1000, run }], logger);
    await vi.advanceTimersByTimeAsync(3500); // 3 такти інтервалу, а перший запуск не завершено

    expect(run).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(1000);

    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it("stop() зупиняє подальші запуски", async () => {
    const run = vi.fn().mockResolvedValue(undefined);

    const { stop } = startMaintenance([{ name: "a", intervalMs: 1000, run }], logger);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(run).toHaveBeenCalledTimes(2);
  });
});

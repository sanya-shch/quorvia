import { afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Cleanup on a REAL Prisma + Postgres (PGlite) and real files in a temp directory: checks what
// gets deleted and, just as important, what stays (fresh, completed, foreign).
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { cleanupExpiredExports, cleanupOrphanExportFiles, cleanupStaleAttempts } = await import(
  "./maintenance.service.js"
);

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-01T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let dir: string;
let outside: string; // a file OUTSIDE the exports directory must survive any cleanup

const exists = (p: string) =>
  fs.access(p).then(
    () => true,
    () => false,
  );

const writeExportFile = async (name: string, ageDays = 0) => {
  const file = path.join(dir, name);
  await fs.writeFile(file, "data");
  await fs.utimes(file, daysAgo(ageDays), daysAgo(ageDays));
  return file;
};

const createJob = (
  n: number,
  createdDaysAgo: number,
  extra: { status?: "COMPLETED" | "FAILED" | "PENDING"; filePath?: string | null } = {},
) =>
  prisma.exportJob.create({
    data: {
      id: id(n),
      formId: "form-1",
      userId: "user-1",
      format: "CSV",
      status: extra.status ?? "COMPLETED",
      filePath: extra.filePath === undefined ? `${id(n)}-report.csv` : extra.filePath,
      fileName: "report.csv",
      createdAt: daysAgo(createdDaysAgo),
    },
  });

const createAttempt = (key: string, startedDaysAgo: number, completed = false) =>
  prisma.responseAttempt.create({
    data: {
      formId: "form-1",
      sessionKey: key,
      answers: {},
      startedAt: daysAgo(startedDaysAgo),
      completedAt: completed ? daysAgo(startedDaysAgo) : null,
    },
  });

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "exports-"));
  outside = path.join(os.tmpdir(), `outside-${Date.now()}.txt`);
  await fs.writeFile(outside, "must survive");

  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: "user-1", email: "a@b.c", password: "x" } });
  await prisma.form.create({ data: { id: "form-1", title: "F", userId: "user-1", shareId: "s1" } });
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(outside, { force: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("cleanupExpiredExports", () => {
  it("видаляє прострочені завдання разом із файлами, свіжі лишає", async () => {
    await createJob(1, 10);
    await createJob(2, 8, { status: "FAILED", filePath: null }); // no file
    await createJob(3, 2); // fresh
    const oldFile = await writeExportFile(`${id(1)}-report.csv`, 10);
    const freshFile = await writeExportFile(`${id(3)}-report.csv`, 2);

    const result = await cleanupExpiredExports({ retentionDays: 7, now: NOW, exportsDir: dir });

    expect(result).toEqual({ jobs: 2, files: 1 });
    expect(await exists(oldFile)).toBe(false);
    expect(await exists(freshFile)).toBe(true);
    const left = await prisma.exportJob.findMany({ select: { id: true } });
    expect(left.map((j) => j.id)).toEqual([id(3)]);
  });

  it("запис, чий файл уже зник, видаляється без помилки", async () => {
    await createJob(1, 10); // there is no file on disk

    const result = await cleanupExpiredExports({ retentionDays: 7, now: NOW, exportsDir: dir });

    expect(result).toEqual({ jobs: 1, files: 0 });
  });

  it("прострочені PENDING/PROCESSING (воркер упав) теж прибираються", async () => {
    await createJob(1, 30, { status: "PENDING", filePath: null });

    expect((await cleanupExpiredExports({ retentionDays: 7, now: NOW, exportsDir: dir })).jobs).toBe(1);
  });

  it("НЕ виходить за межі каталогу, навіть якщо в БД filePath із ../ (path traversal)", async () => {
    await createJob(1, 10, { filePath: path.relative(dir, outside) });

    const result = await cleanupExpiredExports({ retentionDays: 7, now: NOW, exportsDir: dir });

    expect(result.files).toBe(0);
    expect(await exists(outside)).toBe(true);
    expect(await prisma.exportJob.count()).toBe(0); // the row is removed anyway
  });

  it("обробляє більше завдань, ніж розмір порції (кілька ітерацій), і нічого не лишає", async () => {
    for (let n = 1; n <= 7; n++) {
      await createJob(n, 20 + n);
      await writeExportFile(`${id(n)}-report.csv`, 20 + n);
    }

    const result = await cleanupExpiredExports({
      retentionDays: 7,
      now: NOW,
      exportsDir: dir,
      batchSize: 3,
    });

    expect(result).toEqual({ jobs: 7, files: 7 });
    expect(await prisma.exportJob.count()).toBe(0);
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("межа retention: рівно N днів ще не прострочено", async () => {
    await createJob(1, 7);

    expect((await cleanupExpiredExports({ retentionDays: 7, now: NOW, exportsDir: dir })).jobs).toBe(0);
  });
});

describe("cleanupOrphanExportFiles", () => {
  it("видаляє старий файл без запису в БД (наприклад, форму видалили каскадом)", async () => {
    const orphan = await writeExportFile(`${id(9)}-report.csv`, 30);

    const result = await cleanupOrphanExportFiles({ retentionDays: 7, now: NOW, exportsDir: dir });

    expect(result.files).toBe(1);
    expect(await exists(orphan)).toBe(false);
  });

  it("лишає файл, у якого є запис у БД", async () => {
    await createJob(1, 1);
    const tracked = await writeExportFile(`${id(1)}-report.csv`, 30);

    expect((await cleanupOrphanExportFiles({ retentionDays: 7, now: NOW, exportsDir: dir })).files).toBe(0);
    expect(await exists(tracked)).toBe(true);
  });

  it("лишає СВІЖИЙ файл без запису: воркер міг щойно його записати", async () => {
    const fresh = await writeExportFile(`${id(9)}-report.csv`, 0);

    expect((await cleanupOrphanExportFiles({ retentionDays: 7, now: NOW, exportsDir: dir })).files).toBe(0);
    expect(await exists(fresh)).toBe(true);
  });

  it("не чіпає чужі файли, назва яких не схожа на <uuid>-<ім'я>", async () => {
    const foreign = await writeExportFile("notes.txt", 100);
    const almost = await writeExportFile("not-a-uuid-report.csv", 100);

    expect((await cleanupOrphanExportFiles({ retentionDays: 7, now: NOW, exportsDir: dir })).files).toBe(0);
    expect(await exists(foreign)).toBe(true);
    expect(await exists(almost)).toBe(true);
  });

  it("каталогу ще не існує - не помилка", async () => {
    const result = await cleanupOrphanExportFiles({
      retentionDays: 7,
      now: NOW,
      exportsDir: path.join(dir, "missing"),
    });

    expect(result.files).toBe(0);
  });

  it("працює порціями: багато сиріт за кілька запитів до БД", async () => {
    await createJob(1, 1); // one file has a row
    await writeExportFile(`${id(1)}-report.csv`, 30);
    for (let n = 10; n < 17; n++) await writeExportFile(`${id(n)}-report.csv`, 30);

    const result = await cleanupOrphanExportFiles({
      retentionDays: 7,
      now: NOW,
      exportsDir: dir,
      batchSize: 3,
    });

    expect(result.files).toBe(7);
    expect(await fs.readdir(dir)).toEqual([`${id(1)}-report.csv`]);
  });
});

describe("cleanupStaleAttempts", () => {
  it("видаляє старі НЕзавершені проходження, лишає свіжі та завершені", async () => {
    await createAttempt("old-abandoned", 200);
    await createAttempt("old-completed", 200, true);
    await createAttempt("fresh-abandoned", 5);

    const result = await cleanupStaleAttempts({ retentionDays: 180, now: NOW });

    expect(result.attempts).toBe(1);
    const left = await prisma.responseAttempt.findMany({ select: { sessionKey: true } });
    expect(left.map((a) => a.sessionKey).sort()).toEqual(["fresh-abandoned", "old-completed"]);
  });

  it("retentionDays = 0 вимикає прибирання", async () => {
    await createAttempt("old-abandoned", 1000);

    expect((await cleanupStaleAttempts({ retentionDays: 0, now: NOW })).attempts).toBe(0);
    expect(await prisma.responseAttempt.count()).toBe(1);
  });

  it("порціями: видаляє все, що більше за розмір порції", async () => {
    for (let n = 0; n < 8; n++) await createAttempt(`old-${n}`, 300);
    await createAttempt("keep", 1);

    const result = await cleanupStaleAttempts({ retentionDays: 180, now: NOW, batchSize: 3 });

    expect(result.attempts).toBe(8);
    expect(await prisma.responseAttempt.count()).toBe(1);
  });

  it("autosave, що оновив updatedAt, не рятує старе проходження: поріг - за startedAt", async () => {
    const attempt = await createAttempt("long-session", 200);
    await prisma.responseAttempt.update({ where: { id: attempt.id }, data: { answers: { q: 1 } } }); // updatedAt = now

    expect((await cleanupStaleAttempts({ retentionDays: 180, now: NOW })).attempts).toBe(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../shared/middleware/errorHandler.js";

vi.mock("../../prisma/prisma.js", () => ({
  prisma: {
    form: { findUnique: vi.fn() },
    exportJob: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("./export.queue.js", () => ({
  exportQueue: { add: vi.fn() },
}));

vi.mock("node:fs/promises", () => {
  const access = vi.fn();
  return { default: { access }, access };
});

const { prisma } = await import("../../prisma/prisma.js");
const { exportQueue } = await import("./export.queue.js");
const fs = await import("node:fs/promises");
const {
  MAX_ACTIVE_EXPORTS_PER_USER,
  createExportJob,
  listExportJobs,
  getExportJob,
  getExportFileForDownload,
} =
  await import("./export.service.js");

const OWNER_ID = "user-owner";
const OTHER_USER_ID = "user-other";
const FORM_ID = "form-1";

const mockForm = (overrides: Partial<{ id: string; userId: string }> = {}) => ({
  id: FORM_ID,
  userId: OWNER_ID,
  title: "Форма",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createExportJob", () => {
  it("кидає 404, якщо форми не існує", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);

    await expect(createExportJob(FORM_ID, OWNER_ID, "CSV")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.exportJob.create).not.toHaveBeenCalled();
  });

  it("кидає 403, якщо користувач не власник форми", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());

    await expect(createExportJob(FORM_ID, OTHER_USER_ID, "CSV")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prisma.exportJob.create).not.toHaveBeenCalled();
  });

  it("відхиляє новий експорт (429), якщо в користувача вже забагато активних", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.exportJob.count as any).mockResolvedValue(MAX_ACTIVE_EXPORTS_PER_USER);

    await expect(createExportJob(FORM_ID, OWNER_ID, "CSV")).rejects.toMatchObject({
      statusCode: 429,
      message: "RATE_LIMITED",
    });
    expect(prisma.exportJob.create).not.toHaveBeenCalled();
    expect(exportQueue.add).not.toHaveBeenCalled();
  });

  it("рахує лише активні (PENDING/PROCESSING) і недавні завдання цього користувача", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.exportJob.create as any).mockResolvedValue({ id: "job-1" });
    (prisma.exportJob.count as any).mockResolvedValue(0);

    await createExportJob(FORM_ID, OWNER_ID, "CSV");

    expect(prisma.exportJob.count).toHaveBeenCalledWith({
      where: {
        userId: OWNER_ID,
        status: { in: ["PENDING", "PROCESSING"] },
        createdAt: { gt: expect.any(Date) },
      },
    });
  });

  it("створює ExportJob і ставить завдання в чергу з jobId = id job-у (ідемпотентність)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.exportJob.count as any).mockResolvedValue(0);
    const createdJob = {
      id: "job-1",
      formId: FORM_ID,
      format: "CSV",
      status: "PENDING",
      fileName: null,
      responseCount: null,
      error: null,
      createdAt: new Date("2026-01-01"),
      completedAt: null,
    };
    (prisma.exportJob.create as any).mockResolvedValue(createdJob);

    const result = await createExportJob(FORM_ID, OWNER_ID, "CSV");

    expect(prisma.exportJob.create).toHaveBeenCalledWith({
      data: { formId: FORM_ID, userId: OWNER_ID, format: "CSV", status: "PENDING" },
    });
    expect(exportQueue.add).toHaveBeenCalledWith(
      "generate",
      { exportJobId: "job-1" },
      { jobId: "job-1" },
    );
    expect(result).toEqual({
      id: "job-1",
      formId: FORM_ID,
      format: "CSV",
      status: "PENDING",
      fileName: null,
      responseCount: null,
      error: null,
      createdAt: createdJob.createdAt,
      completedAt: null,
    });
  });
});

describe("listExportJobs", () => {
  it("кидає 403 для не-власника форми", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());

    await expect(listExportJobs(FORM_ID, OTHER_USER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("повертає job-и, відсортовані за createdAt desc", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.exportJob.findMany as any).mockResolvedValue([]);

    await listExportJobs(FORM_ID, OWNER_ID);

    expect(prisma.exportJob.findMany).toHaveBeenCalledWith({
      where: { formId: FORM_ID },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("getExportJob", () => {
  it("кидає 404, якщо job не знайдено", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.exportJob.findUnique as any).mockResolvedValue(null);

    await expect(getExportJob(FORM_ID, OWNER_ID, "job-x")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("кидає 404, якщо job належить іншій формі (навіть якщо id збігається за помилкою)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.exportJob.findUnique as any).mockResolvedValue({
      id: "job-x",
      formId: "other-form",
    });

    await expect(getExportJob(FORM_ID, OWNER_ID, "job-x")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("повертає DTO job-у для власника форми", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.exportJob.findUnique as any).mockResolvedValue({
      id: "job-1",
      formId: FORM_ID,
      format: "PDF",
      status: "COMPLETED",
      fileName: "form.pdf",
      responseCount: 5,
      error: null,
      createdAt: new Date("2026-01-01"),
      completedAt: new Date("2026-01-01T00:01:00.000Z"),
    });

    const result = await getExportJob(FORM_ID, OWNER_ID, "job-1");

    expect(result.id).toBe("job-1");
    expect(result.status).toBe("COMPLETED");
    expect(result.responseCount).toBe(5);
  });
});

describe("getExportFileForDownload", () => {
  const completedJob = {
    id: "job-1",
    formId: FORM_ID,
    status: "COMPLETED",
    filePath: "job-1-file.csv",
    fileName: "form-responses.csv",
  };

  it("кидає 404, якщо job для завантаження не знайдено", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.exportJob.findUnique as any).mockResolvedValue(null);

    await expect(getExportFileForDownload(FORM_ID, OWNER_ID, "job-missing")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("кидає 409, якщо job ще не завершено", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.exportJob.findUnique as any).mockResolvedValue({
      ...completedJob,
      status: "PROCESSING",
    });

    await expect(getExportFileForDownload(FORM_ID, OWNER_ID, "job-1")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("кидає 410, якщо файл є в БД, але відсутній на диску", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.exportJob.findUnique as any).mockResolvedValue(completedJob);
    (fs.access as any).mockRejectedValue(new Error("ENOENT"));

    await expect(getExportFileForDownload(FORM_ID, OWNER_ID, "job-1")).rejects.toMatchObject({
      statusCode: 410,
    });
  });

  it("повертає шлях і ім'я файлу, коли job завершено успішно", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.exportJob.findUnique as any).mockResolvedValue(completedJob);
    (fs.access as any).mockResolvedValue(undefined);

    const result = await getExportFileForDownload(FORM_ID, OWNER_ID, "job-1");

    expect(result.fileName).toBe("form-responses.csv");
    expect(result.absolutePath).toContain("job-1-file.csv");
  });
});

describe("AppError sanity", () => {
  it("має правильний statusCode на інстансі", () => {
    const err = new AppError("test", 418);
    expect(err.statusCode).toBe(418);
  });
});

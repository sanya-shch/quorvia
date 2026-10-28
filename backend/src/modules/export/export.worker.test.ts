import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/prisma.js", () => ({
  prisma: {
    exportJob: { findUnique: vi.fn(), update: vi.fn() },
    form: { findUniqueOrThrow: vi.fn() },
  },
}));

vi.mock("./exporters/index.js", () => ({
  exportersByFormat: {
    CSV: vi.fn(),
    EXCEL: vi.fn(),
    PDF: vi.fn(),
  },
}));

vi.mock("node:fs/promises", () => {
  const mkdir = vi.fn().mockResolvedValue(undefined);
  const writeFile = vi.fn().mockResolvedValue(undefined);
  return { default: { mkdir, writeFile }, mkdir, writeFile };
});

vi.mock("../../shared/queue/redisConnection.js", () => ({
  redisConnection: {},
}));

const { UnrecoverableError } = await import("bullmq");
const { prisma } = await import("../../prisma/prisma.js");
const { exportersByFormat } = await import("./exporters/index.js");
const fs = await import("node:fs/promises");
const { MAX_EXPORT_RESPONSES, processExportJob } = await import("./export.worker.js");

const EXPORT_JOB_ID = "export-job-1";

const makeJob = (data: Record<string, unknown> = {}) =>
  ({ data: { exportJobId: EXPORT_JOB_ID, ...data } }) as any;

const pendingExportJob = {
  id: EXPORT_JOB_ID,
  formId: "form-1",
  userId: "user-1",
  format: "CSV",
  status: "PENDING",
};

const formWithData = {
  id: "form-1",
  title: "Форма",
  description: null,
  questions: [{ id: "q-1" }],
  responses: [{ id: "r-1" }, { id: "r-2" }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processExportJob", () => {
  it("нічого не робить, якщо ExportJob вже видалено з БД (наприклад, форму видалили каскадом)", async () => {
    (prisma.exportJob.findUnique as any).mockResolvedValue(null);

    await processExportJob(makeJob());

    expect(prisma.exportJob.update).not.toHaveBeenCalled();
    expect(prisma.form.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("happy path: PENDING -> PROCESSING -> COMPLETED з правильними полями", async () => {
    (prisma.exportJob.findUnique as any).mockResolvedValue(pendingExportJob);
    (prisma.form.findUniqueOrThrow as any).mockResolvedValue(formWithData);
    (exportersByFormat.CSV as any).mockResolvedValue({
      buffer: Buffer.from("csv-content"),
      fileName: "form-responses.csv",
      mimeType: "text/csv",
    });

    await processExportJob(makeJob());

    expect((prisma.exportJob.update as any).mock.calls[0][0]).toEqual({
      where: { id: EXPORT_JOB_ID },
      data: { status: "PROCESSING" },
    });

    expect(exportersByFormat.CSV).toHaveBeenCalledWith({
      form: { id: "form-1", title: "Форма", description: null },
      questions: formWithData.questions,
      responses: formWithData.responses,
    });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(`${EXPORT_JOB_ID}-form-responses.csv`),
      Buffer.from("csv-content"),
    );

    const finalUpdate = (prisma.exportJob.update as any).mock.calls[1][0];
    expect(finalUpdate.where).toEqual({ id: EXPORT_JOB_ID });
    expect(finalUpdate.data).toMatchObject({
      status: "COMPLETED",
      filePath: `${EXPORT_JOB_ID}-form-responses.csv`,
      fileName: "form-responses.csv",
      responseCount: 2,
      error: null,
    });
    expect(finalUpdate.data.completedAt).toBeInstanceOf(Date);
  });

  it("обирає exporter відповідно до формату job-у (EXCEL)", async () => {
    (prisma.exportJob.findUnique as any).mockResolvedValue({
      ...pendingExportJob,
      format: "EXCEL",
    });
    (prisma.form.findUniqueOrThrow as any).mockResolvedValue(formWithData);
    (exportersByFormat.EXCEL as any).mockResolvedValue({
      buffer: Buffer.from("xlsx"),
      fileName: "form.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await processExportJob(makeJob());

    expect(exportersByFormat.EXCEL).toHaveBeenCalled();
    expect(exportersByFormat.CSV).not.toHaveBeenCalled();
  });

  it("error path: виставляє FAILED зі стабільним кодом (без сирого тексту помилки) і прокидає помилку далі (для retry BullMQ)", async () => {
    (prisma.exportJob.findUnique as any).mockResolvedValue(pendingExportJob);
    (prisma.form.findUniqueOrThrow as any).mockRejectedValue(new Error("Form not found in DB"));

    await expect(processExportJob(makeJob())).rejects.toThrow("Form not found in DB");

    const finalUpdate = (prisma.exportJob.update as any).mock.calls.at(-1)[0];
    expect(finalUpdate.data).toEqual({
      status: "FAILED",
      error: "EXPORT_FAILED",
    });
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("error path: невідома (не-Error) помилка все одно записує код помилки і ретрайиться", async () => {
    (prisma.exportJob.findUnique as any).mockResolvedValue(pendingExportJob);
    (prisma.form.findUniqueOrThrow as any).mockRejectedValue("boom");

    await expect(processExportJob(makeJob())).rejects.toBe("boom");

    const finalUpdate = (prisma.exportJob.update as any).mock.calls.at(-1)[0];
    expect(finalUpdate.data.error).toBe("EXPORT_FAILED");
  });

  it("забагато відповідей: FAILED з кодом EXPORT_TOO_LARGE, експортер не викликається, ретрай не потрібен", async () => {
    (prisma.exportJob.findUnique as any).mockResolvedValue(pendingExportJob);
    (prisma.form.findUniqueOrThrow as any).mockResolvedValue({
      id: "form-1",
      title: "Форма",
      description: null,
      questions: [],
      responses: Array.from({ length: MAX_EXPORT_RESPONSES + 1 }, (_, i) => ({ id: `r${i}` })),
    });

    await expect(processExportJob(makeJob())).rejects.toBeInstanceOf(UnrecoverableError);

    const finalUpdate = (prisma.exportJob.update as any).mock.calls.at(-1)[0];
    expect(finalUpdate.data).toEqual({ status: "FAILED", error: "EXPORT_TOO_LARGE" });
    expect(exportersByFormat.CSV).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

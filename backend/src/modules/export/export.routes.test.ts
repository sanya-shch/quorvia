import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildTestApp, makeAuthHeader, TEST_JWT_SECRET } from "../../test/testApp.js";
import { AppError } from "../../shared/middleware/errorHandler.js";

vi.mock("./export.service.js", () => ({
  createExportJob: vi.fn(),
  listExportJobs: vi.fn(),
  getExportJob: vi.fn(),
  getExportFileForDownload: vi.fn(),
}));

const service = await import("./export.service.js");
const exportRouter = (await import("./export.routes.js")).default;

const app = buildTestApp(exportRouter, "/api/forms");
const AUTH = makeAuthHeader("user-1");

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/forms/:formId/export", () => {
  it("401 без токена", async () => {
    const res = await request(app).post("/api/forms/form-1/export").send({ format: "CSV" });

    expect(res.status).toBe(401);
  });

  it("400 для невідомого формату", async () => {
    const res = await request(app)
      .post("/api/forms/form-1/export")
      .set("Authorization", AUTH)
      .send({ format: "DOCX" });

    expect(res.status).toBe(400);
    expect(service.createExportJob).not.toHaveBeenCalled();
  });

  it("202 і job у відповіді для валідного формату", async () => {
    (service.createExportJob as any).mockResolvedValue({
      id: "job-1",
      status: "PENDING",
    });

    const res = await request(app)
      .post("/api/forms/form-1/export")
      .set("Authorization", AUTH)
      .send({ format: "CSV" });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ id: "job-1", status: "PENDING" });
    expect(service.createExportJob).toHaveBeenCalledWith("form-1", "user-1", "CSV");
  });
});

describe("GET /api/forms/:formId/export", () => {
  it("200 зі списком job-ів форми", async () => {
    (service.listExportJobs as any).mockResolvedValue([{ id: "job-1" }]);

    const res = await request(app).get("/api/forms/form-1/export").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "job-1" }]);
  });
});

describe("GET /api/forms/:formId/export/:jobId", () => {
  it("404, якщо job не знайдено", async () => {
    (service.getExportJob as any).mockRejectedValue(new AppError("Export job not found", 404));

    const res = await request(app).get("/api/forms/form-1/export/job-x").set("Authorization", AUTH);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/forms/:formId/export/:jobId/download", () => {
  it("409, якщо job ще не завершено", async () => {
    (service.getExportFileForDownload as any).mockRejectedValue(
      new AppError("Export is not ready yet", 409),
    );

    const res = await request(app)
      .get("/api/forms/form-1/export/job-1/download")
      .set("Authorization", AUTH);

    expect(res.status).toBe(409);
  });

  it("стрімить реальний файл з диска з правильними заголовками", async () => {
    const tmpFile = path.join(os.tmpdir(), `export-test-${Date.now()}.csv`);
    await fs.writeFile(tmpFile, "a,b,c\n1,2,3\n", "utf-8");

    (service.getExportFileForDownload as any).mockResolvedValue({
      absolutePath: tmpFile,
      fileName: "form-responses.csv",
    });

    const res = await request(app)
      .get("/api/forms/form-1/export/job-1/download")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("form-responses.csv");
    expect(res.text).toBe("a,b,c\n1,2,3\n");

    await fs.unlink(tmpFile);
  });
});

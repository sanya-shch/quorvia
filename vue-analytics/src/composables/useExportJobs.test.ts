import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { apiGet, apiPost, apiDownload, ApiError } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn(), apiDownload: vi.fn() };
});

import { useExportJobs, getExportErrorMessage } from "./useExportJobs";

const mockedApiGet = vi.mocked(apiGet);
const mockedApiPost = vi.mocked(apiPost);
const mockedApiDownload = vi.mocked(apiDownload);

import type { ExportJobDto } from "@quorvia/shared-types";

const job = (overrides: Partial<Pick<ExportJobDto, "id" | "status">> = {}): ExportJobDto => ({
  id: "job-1",
  formId: "form-1",
  format: "CSV",
  status: "COMPLETED",
  fileName: "export.csv",
  responseCount: 5,
  error: null,
  createdAt: "2026-01-01",
  completedAt: "2026-01-01",
  ...overrides,
});

describe("getExportErrorMessage (чиста функція, без async/mock)", () => {
  it("ApiError -> повідомлення про список експортів", () => {
    expect(getExportErrorMessage(new ApiError(500, "x"))).toBe(
      "analytics.errors.exportListLoadFailed",
    );
  });
});

describe("useExportJobs (composable)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedApiGet.mockReset();
    mockedApiPost.mockReset();
    mockedApiDownload.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("завантажує список одразу при виклику", async () => {
    mockedApiGet.mockResolvedValue([job()]);

    const { jobs, isLoading } = useExportJobs("http://api.test", "form-1");
    expect(isLoading.value).toBe(true);

    await flushPromises();

    expect(isLoading.value).toBe(false);
    expect(jobs.value).toHaveLength(1);
  });

  it("НЕ переопитує (poll), якщо всі jobs у фінальному стані (COMPLETED)", async () => {
    mockedApiGet.mockResolvedValue([job({ status: "COMPLETED" })]);

    useExportJobs("http://api.test", "form-1");
    await flushPromises();
    expect(mockedApiGet).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);

    expect(mockedApiGet).toHaveBeenCalledTimes(1);
  });

  it("переопитує кожні 2с, поки є PENDING/PROCESSING job, і зупиняється, коли всі завершились", async () => {
    mockedApiGet
      .mockResolvedValueOnce([job({ status: "PROCESSING" })])
      .mockResolvedValueOnce([job({ status: "PROCESSING" })])
      .mockResolvedValueOnce([job({ status: "COMPLETED" })]);

    useExportJobs("http://api.test", "form-1");
    await flushPromises();
    expect(mockedApiGet).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(mockedApiGet).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(mockedApiGet).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(5000);
    expect(mockedApiGet).toHaveBeenCalledTimes(3);
  });

  it("createExport викликає apiPost, потім одразу перезавантажує список", async () => {
    mockedApiGet.mockResolvedValue([]);
    mockedApiPost.mockResolvedValue(job({ status: "PENDING" }));

    const { createExport } = useExportJobs("http://api.test", "form-1");
    await flushPromises();
    mockedApiGet.mockClear();

    mockedApiGet.mockResolvedValue([job({ status: "PENDING" })]);
    await createExport("CSV");

    expect(mockedApiPost).toHaveBeenCalledWith("http://api.test", "/forms/form-1/export", {
      format: "CSV",
    });
    expect(mockedApiGet).toHaveBeenCalledTimes(1);
  });

  it("downloadExport запускає завантаження файлу через тимчасовий <a>", async () => {
    mockedApiGet.mockResolvedValue([]);
    const fakeBlob = new Blob(["дані"]);
    mockedApiDownload.mockResolvedValue({ blob: fakeBlob, fileName: "export.csv" });

    const createObjectURLSpy = vi.fn(() => "blob:mock-url");
    const revokeObjectURLSpy = vi.fn();
    window.URL.createObjectURL = createObjectURLSpy;
    window.URL.revokeObjectURL = revokeObjectURLSpy;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const { downloadExport } = useExportJobs("http://api.test", "form-1");
    await flushPromises();

    await downloadExport(job());

    expect(mockedApiDownload).toHaveBeenCalledWith(
      "http://api.test",
      "/forms/form-1/export/job-1/download",
    );
    expect(createObjectURLSpy).toHaveBeenCalledWith(fakeBlob);
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");

    clickSpy.mockRestore();
  });

  it("не накопичує паралельні таймери - завжди прибирає попередній перед плануванням нового", async () => {
    mockedApiGet.mockResolvedValue([job({ status: "PROCESSING" })]);

    useExportJobs("http://api.test", "form-1");
    await flushPromises();

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockedApiGet).toHaveBeenCalledTimes(3);
  });
});

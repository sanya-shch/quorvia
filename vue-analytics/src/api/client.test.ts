import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AUTH_EXPIRED_EVENT } from "@surveycraft/shared-types";
import { apiGet, apiPost, apiDownload, ApiError, setAuthBridge } from "./client";

describe("apiGet", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setAuthBridge(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("додає Authorization header, якщо хост надав токен через міст автентифікації", async () => {
    setAuthBridge({ getAccessToken: () => "abc123" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hello: "world" }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await apiGet("http://api.test", "/forms/1/analytics");

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/forms/1/analytics", {
      headers: { Authorization: "Bearer abc123" },
    });
  });

  it("не додає Authorization header, якщо токена немає", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await apiGet("http://api.test", "/forms/1/analytics");

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/forms/1/analytics", { headers: {} });
  });

  it("повертає розпарсений JSON при успіху", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalResponses: 5 }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await apiGet<{ totalResponses: number }>("http://api.test", "/x");
    expect(result).toEqual({ totalResponses: 5 });
  });

  it("кидає ApiError зі статусом при неуспішній відповіді", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiGet("http://api.test", "/x")).rejects.toBeInstanceOf(ApiError);
    await expect(apiGet("http://api.test", "/x")).rejects.toMatchObject({ status: 403 });
  });

  it("при 401 (без можливості refresh) диспатчить AUTH_EXPIRED_EVENT - React-хост відповідає за сам релогін", async () => {
    setAuthBridge({ getAccessToken: () => "expired-token" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const eventListener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, eventListener);

    await expect(apiGet("http://api.test", "/x")).rejects.toBeInstanceOf(ApiError);

    expect(eventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(AUTH_EXPIRED_EVENT, eventListener);
  });

  it("при 403/404 НЕ диспатчить AUTH_EXPIRED_EVENT (немає доступу - не те саме, що протух токен)", async () => {
    setAuthBridge({ getAccessToken: () => "valid-token" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const eventListener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, eventListener);

    await expect(apiGet("http://api.test", "/x")).rejects.toBeInstanceOf(ApiError);

    expect(eventListener).not.toHaveBeenCalled();

    window.removeEventListener(AUTH_EXPIRED_EVENT, eventListener);
  });
});

describe("apiPost", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setAuthBridge(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("надсилає JSON-тіло з Content-Type header і методом POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "job-1" }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await apiPost("http://api.test", "/forms/1/export", { format: "CSV" });

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/forms/1/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "CSV" }),
    });
  });

  it("додає Authorization header поряд з Content-Type, коли токен є", async () => {
    setAuthBridge({ getAccessToken: () => "abc123" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await apiPost("http://api.test", "/x", {});

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/x",
      expect.objectContaining({
        headers: { Authorization: "Bearer abc123", "Content-Type": "application/json" },
      }),
    );
  });

  it("кидає ApiError при неуспішній відповіді, як і apiGet", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiPost("http://api.test", "/x", {})).rejects.toBeInstanceOf(ApiError);
  });
});

describe("apiDownload", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("повертає blob і ім'я файлу з Content-Disposition", async () => {
    const fakeBlob = new Blob(["дані"], { type: "text/csv" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => fakeBlob,
      headers: new Headers({ "content-disposition": 'attachment; filename="export.csv"' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await apiDownload("http://api.test", "/forms/1/export/job-1/download");

    expect(result.blob).toBe(fakeBlob);
    expect(result.fileName).toBe("export.csv");
  });

  it("fileName - null, якщо Content-Disposition відсутній", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["x"]),
      headers: new Headers(),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await apiDownload("http://api.test", "/x");

    expect(result.fileName).toBeNull();
  });

  it("кидає ApiError при неуспішній відповіді", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, headers: new Headers() });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiDownload("http://api.test", "/x")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("міст автентифікації: refresh при 401", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    setAuthBridge(null);
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("при 401 просить хост оновити токен і повторює запит рівно один раз з новим токеном", async () => {
    const refreshAccessToken = vi.fn().mockResolvedValue("fresh-token");
    setAuthBridge({ getAccessToken: () => "expired-token", refreshAccessToken });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: 1 }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await apiGet("http://api.test", "/x");

    expect(result).toEqual({ ok: 1 });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: "Bearer fresh-token" });
  });

  it("якщо refresh не вдався - диспатчить AUTH_EXPIRED_EVENT і кидає ApiError", async () => {
    setAuthBridge({ getAccessToken: () => "expired-token", refreshAccessToken: async () => null });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as unknown as typeof fetch;
    const listener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);

    await expect(apiGet("http://api.test", "/x")).rejects.toMatchObject({ status: 401 });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
  });

  it("не читає токен з localStorage (навіть якщо він там є)", async () => {
    localStorage.setItem("token", "stale-token");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await apiGet("http://api.test", "/x");

    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
    localStorage.clear();
  });
});

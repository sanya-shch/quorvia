import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiGet, ApiError } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, apiGet: vi.fn() };
});

import { useResponseDetail, getResponseDetailErrorMessage } from "./useResponseDetail";

const mockedApiGet = vi.mocked(apiGet);

describe("getResponseDetailErrorMessage (чиста функція, без async/mock)", () => {
  it("ApiError -> повідомлення про деталі відповіді", () => {
    expect(getResponseDetailErrorMessage(new ApiError(404, "x"))).toBe(
      "analytics.errors.responseDetailLoadFailed",
    );
  });
  it("не-ApiError -> 'Помилка мережі'", () => {
    expect(getResponseDetailErrorMessage(new TypeError("x"))).toBe("analytics.errors.networkError");
  });
});

describe("useResponseDetail (composable)", () => {
  beforeEach(() => mockedApiGet.mockReset());

  it("НЕ фетчить одразу - isLoading=false до виклику load()", () => {
    const { isLoading, data } = useResponseDetail("http://api.test", "form-1");
    expect(isLoading.value).toBe(false);
    expect(data.value).toBeNull();
    expect(mockedApiGet).not.toHaveBeenCalled();
  });

  it("load(responseId) фетчить правильний endpoint", async () => {
    mockedApiGet.mockResolvedValue({
      id: "resp-1",
      formId: "form-1",
      createdAt: "2026-01-01",
      answers: [],
    });

    const { data, load } = useResponseDetail("http://api.test", "form-1");
    await load("resp-1");

    expect(data.value?.id).toBe("resp-1");
    expect(mockedApiGet).toHaveBeenCalledWith("http://api.test", "/forms/form-1/responses/resp-1");
  });
});

describe("useResponseDetail: перемикання між відповідями", () => {
  beforeEach(() => mockedApiGet.mockReset());

  const response = (id: string) => ({
    id,
    formId: "form-1",
    createdAt: "2026-01-01",
    answers: [],
  });

  // A request the test settles by hand, to decide in which order the answers arrive.
  const deferred = () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<ReturnType<typeof response>>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  it("поки вантажиться наступна відповідь, попередня лишається в data (без блимання)", async () => {
    const next = deferred();
    mockedApiGet.mockResolvedValueOnce(response("r-1")).mockReturnValueOnce(next.promise);
    const { data, isLoading, load } = useResponseDetail("http://api.test", "form-1");

    await load("r-1");
    const loading = load("r-2");

    expect(isLoading.value).toBe(true);
    expect(data.value?.id).toBe("r-1");

    next.resolve(response("r-2"));
    await loading;

    expect(isLoading.value).toBe(false);
    expect(data.value?.id).toBe("r-2");
  });

  it("запізніла відповідь на попередній клік не перезаписує нову", async () => {
    const first = deferred();
    const second = deferred();
    mockedApiGet.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { data, isLoading, load } = useResponseDetail("http://api.test", "form-1");

    const a = load("r-a");
    const b = load("r-b");

    second.resolve(response("r-b"));
    await b;
    expect(data.value?.id).toBe("r-b");
    expect(isLoading.value).toBe(false);

    first.resolve(response("r-a")); // arrives last, but belongs to an older click
    await a;
    expect(data.value?.id).toBe("r-b");
    expect(isLoading.value).toBe(false);
  });

  it("помилка актуального запиту прибирає стару відповідь і показує помилку", async () => {
    const failing = deferred();
    mockedApiGet.mockResolvedValueOnce(response("r-1")).mockReturnValueOnce(failing.promise);
    const { data, error, load } = useResponseDetail("http://api.test", "form-1");

    await load("r-1");
    const loading = load("r-2");
    failing.reject(new TypeError("offline"));
    await loading;

    expect(data.value).toBeNull();
    expect(error.value).toBe("analytics.errors.networkError");
  });

  it("помилка застарілого запиту не чіпає актуальну відповідь", async () => {
    const stale = deferred();
    const latest = deferred();
    mockedApiGet.mockReturnValueOnce(stale.promise).mockReturnValueOnce(latest.promise);
    const { data, error, load } = useResponseDetail("http://api.test", "form-1");

    const a = load("r-a");
    const b = load("r-b");
    latest.resolve(response("r-b"));
    await b;
    stale.reject(new TypeError("offline"));
    await a;

    expect(data.value?.id).toBe("r-b");
    expect(error.value).toBeNull();
  });
});

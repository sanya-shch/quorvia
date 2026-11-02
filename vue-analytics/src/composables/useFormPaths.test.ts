import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { apiGet, ApiError } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, apiGet: vi.fn() };
});

const mockedApiGet = vi.mocked(apiGet);

describe("getPathsErrorMessage (чиста функція, без async/mock)", () => {
  it("ApiError -> повідомлення про шляхи проходження", async () => {
    const { getPathsErrorMessage } = await import("./useFormPaths");
    expect(getPathsErrorMessage(new ApiError(500, "x"))).toBe("analytics.errors.pathsLoadFailed");
  });

  it("не-ApiError -> 'Помилка мережі'", async () => {
    const { getPathsErrorMessage } = await import("./useFormPaths");
    expect(getPathsErrorMessage(new TypeError("network down"))).toBe(
      "analytics.errors.networkError",
    );
  });
});

describe("useFormPaths (composable - loading/success шлях)", () => {
  beforeEach(() => {
    mockedApiGet.mockReset();
  });

  it("запитує правильний endpoint і заповнює data при успіху", async () => {
    mockedApiGet.mockResolvedValue({ totalResponses: 2, nodes: [], edges: [] });
    const { useFormPaths } = await import("./useFormPaths");

    const { data, isLoading } = useFormPaths("http://api.test", "form-1");
    expect(isLoading.value).toBe(true);

    await flushPromises();

    expect(isLoading.value).toBe(false);
    expect(data.value).toEqual({ totalResponses: 2, nodes: [], edges: [] });
    expect(mockedApiGet).toHaveBeenCalledWith("http://api.test", "/forms/form-1/analytics/paths");
  });
});

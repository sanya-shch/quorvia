import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { apiGet, ApiError } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, apiGet: vi.fn() };
});

import { useFormFunnel, getFunnelErrorMessage } from "./useFormFunnel";

const mockedApiGet = vi.mocked(apiGet);

describe("getFunnelErrorMessage (чиста функція, без async/mock)", () => {
  it("ApiError -> повідомлення про funnel-аналітику", () => {
    expect(getFunnelErrorMessage(new ApiError(500, "x"))).toBe("analytics.errors.funnelLoadFailed");
  });

  it("не-ApiError -> 'Помилка мережі'", () => {
    expect(getFunnelErrorMessage(new TypeError("network down"))).toBe(
      "analytics.errors.networkError",
    );
  });
});

describe("useFormFunnel (composable - loading/success шлях)", () => {
  beforeEach(() => {
    mockedApiGet.mockReset();
  });

  it("запитує правильний endpoint і заповнює data при успіху", async () => {
    mockedApiGet.mockResolvedValue({
      totalAttempts: 10,
      totalCompletions: 4,
      completionRate: 0.4,
      nodes: [{ questionId: "q1", text: "Q1", order: 0, reachedCount: 10 }],
    });

    const { data, isLoading } = useFormFunnel("http://api.test", "form-1");
    expect(isLoading.value).toBe(true);

    await flushPromises();

    expect(isLoading.value).toBe(false);
    expect(data.value?.totalAttempts).toBe(10);
    expect(data.value?.completionRate).toBe(0.4);
    expect(mockedApiGet).toHaveBeenCalledWith("http://api.test", "/forms/form-1/analytics/funnel");
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { apiGet } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, apiGet: vi.fn() };
});

import { useQueryResource } from "./useQueryResource";
import type { QueryParams } from "../period";

const mockedApiGet = vi.mocked(apiGet);

beforeEach(() => mockedApiGet.mockReset());

describe("useQueryResource", () => {
  it("без параметрів URL не має query-рядка, як до появи фільтрів", async () => {
    mockedApiGet.mockResolvedValue({ ok: 1 });

    useQueryResource("http://api", "/forms/f/analytics", () => "err");
    await flushPromises();

    expect(mockedApiGet).toHaveBeenCalledWith("http://api", "/forms/f/analytics");
  });

  it("додає період у запит і перезавантажується, коли він змінюється", async () => {
    mockedApiGet.mockResolvedValue({ n: 1 });
    const params = ref<QueryParams>({ from: "2026-11-01", to: "2026-11-30" });

    useQueryResource("http://api", "/p", () => "err", params);
    await flushPromises();
    expect(mockedApiGet).toHaveBeenLastCalledWith("http://api", "/p?from=2026-11-01&to=2026-11-30");

    params.value = { from: "2026-10-01", to: "2026-10-31" };
    await flushPromises();
    expect(mockedApiGet).toHaveBeenCalledTimes(2);
    expect(mockedApiGet).toHaveBeenLastCalledWith("http://api", "/p?from=2026-10-01&to=2026-10-31");
  });

  it("повільна стара відповідь не затирає нову (клікання по періодах)", async () => {
    let resolveSlow!: (v: unknown) => void;
    mockedApiGet
      .mockImplementationOnce(() => new Promise((r) => (resolveSlow = r)))
      .mockResolvedValueOnce({ period: "new" });
    const params = ref<QueryParams>({ from: "a" });

    const { data, isLoading } = useQueryResource<{ period: string }>(
      "http://api",
      "/p",
      () => "err",
      params,
    );
    params.value = { from: "b" };
    await flushPromises();
    expect(data.value?.period).toBe("new");

    resolveSlow({ period: "old" });
    await flushPromises();

    expect(data.value?.period).toBe("new");
    expect(isLoading.value).toBe(false);
  });
});

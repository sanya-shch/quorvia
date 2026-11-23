import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AxiosError, type AxiosResponse } from "axios";
import { authApi } from "../../api/auth";
import { useAuthStore } from "../../store/useAuthStore";
import { useStartDemo } from "./useStartDemo";

const navigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

vi.mock("../../api/auth", () => ({
  authApi: { demo: vi.fn(), warmUp: vi.fn().mockResolvedValue(undefined) },
}));

const session = {
  accessToken: "token-1",
  user: { id: "u1", email: "demo-1@demo.quorvia.invalid", demo: { expiresAt: "2099-01-01" } },
};

// The error of a real API answer: the body carries an error code.
const apiError = (code: string, status = 503) =>
  new AxiosError("fail", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    data: { message: code },
  } as AxiosResponse);

// What a sleeping host gives: no response at all, or its own page without an error code.
const notReady = () => new AxiosError("Network Error", "ERR_NETWORK");

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const mockedDemo = vi.mocked(authApi.demo);

describe("useStartDemo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedDemo.mockReset();
    navigate.mockReset();
    useAuthStore.getState().clearAuth();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("signs in with the new demo account and opens the dashboard", async () => {
    mockedDemo.mockResolvedValue(session);
    const { result } = renderHook(() => useStartDemo(), { wrapper });

    await act(() => result.current.start());

    expect(useAuthStore.getState().user).toEqual(session.user);
    expect(useAuthStore.getState().token).toBe("token-1");
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("wakes the backend when the page opens (only in the portfolio build: harmless otherwise)", () => {
    renderHook(() => useStartDemo(), { wrapper });

    // IS_FOR_PORTFOLIO is a build-time flag and is off in the test build.
    expect(authApi.warmUp).not.toHaveBeenCalled();
  });

  it("keeps trying while the server is not up, then succeeds", async () => {
    mockedDemo.mockRejectedValueOnce(notReady()).mockRejectedValueOnce(notReady());
    mockedDemo.mockResolvedValue(session);
    const { result } = renderHook(() => useStartDemo(), { wrapper });

    let started!: Promise<void>;
    act(() => {
      started = result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("waking");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
      await started;
    });

    expect(mockedDemo).toHaveBeenCalledTimes(3);
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("does not retry a real API answer: DEMO_CAPACITY_REACHED is final", async () => {
    mockedDemo.mockRejectedValue(apiError("DEMO_CAPACITY_REACHED"));
    const { result } = renderHook(() => useStartDemo(), { wrapper });

    await act(() => result.current.start());

    expect(mockedDemo).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("failed");
    expect(result.current.errorCode).toBe("DEMO_CAPACITY_REACHED");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("gives up after the attempts run out", async () => {
    mockedDemo.mockRejectedValue(notReady());
    const { result } = renderHook(() => useStartDemo(), { wrapper });

    let started!: Promise<void>;
    act(() => {
      started = result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
      await started;
    });

    expect(mockedDemo).toHaveBeenCalledTimes(12);
    expect(result.current.status).toBe("failed");
    expect(result.current.errorCode).toBeUndefined();
  });

  it("ignores a second click while the first is running", async () => {
    mockedDemo.mockResolvedValue(session);
    const { result } = renderHook(() => useStartDemo(), { wrapper });

    await act(async () => {
      await Promise.all([result.current.start(), result.current.start()]);
    });

    expect(mockedDemo).toHaveBeenCalledTimes(1);
  });
});

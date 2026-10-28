import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { AUTH_EXPIRED_EVENT } from "@surveycraft/shared-types";
import { useAuthExpiredListener } from "./useAuthExpiredListener";
import { useAuthStore } from "./useAuthStore";

describe("useAuthExpiredListener", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: "u1", email: "test@example.com" },
      token: "some-valid-token",
      isAuthenticated: true,
      isInitialized: true,
    });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false, isInitialized: false });
  });

  it("при AUTH_EXPIRED_EVENT викликає clearAuth() - скидає isAuthenticated і token у Zustand", () => {
    renderHook(() => useAuthExpiredListener());

    expect(useAuthStore.getState().isAuthenticated).toBe(true); // до події

    act(() => {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("прибирає слухач при unmount - подія після demount більше не викликає clearAuth", () => {
    const { unmount } = renderHook(() => useAuthExpiredListener());
    unmount();

    act(() => {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    });

    // Стан лишився таким, яким був до dispatch - слухач вже знятий
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("не реагує на інші (нерелевантні) window-події", () => {
    renderHook(() => useAuthExpiredListener());

    act(() => {
      window.dispatchEvent(new CustomEvent("some-other-event"));
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

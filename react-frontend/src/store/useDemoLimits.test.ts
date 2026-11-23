import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { DEMO_LIMITS } from "@quorvia/shared-types";
import { useAuthStore } from "./useAuthStore";
import { useDemoLimits } from "./useDemoLimits";

afterEach(() => useAuthStore.getState().clearAuth());

describe("useDemoLimits", () => {
  it("has no limits for a regular account", () => {
    useAuthStore.getState().setAuth({ id: "u", email: "a@b.c" }, "t");

    const { result } = renderHook(() => useDemoLimits());

    expect(result.current).toEqual({ isDemo: false, maxForms: Infinity, maxQuestions: Infinity });
  });

  it("applies the shared demo limits to a demo account", () => {
    useAuthStore
      .getState()
      .setAuth({ id: "u", email: "a@b.c", demo: { expiresAt: "2099-01-01T00:00:00.000Z" } }, "t");

    const { result } = renderHook(() => useDemoLimits());

    expect(result.current).toEqual({
      isDemo: true,
      maxForms: DEMO_LIMITS.maxForms,
      maxQuestions: DEMO_LIMITS.maxQuestionsPerForm,
    });
  });
});

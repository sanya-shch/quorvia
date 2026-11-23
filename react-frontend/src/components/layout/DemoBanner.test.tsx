import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useAuthStore } from "../../store/useAuthStore";
import DemoBanner from "./DemoBanner";

const NOW = new Date("2030-01-01T10:00:00.000Z");

describe("DemoBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.getState().clearAuth();
  });

  it("shows nothing for a regular account", () => {
    useAuthStore.getState().setAuth({ id: "u", email: "a@b.c" }, "t");

    const { container } = render(<DemoBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the time left of a demo account and counts down", () => {
    const expiresAt = new Date(NOW.getTime() + (5 * 60 + 12) * 60_000).toISOString();
    useAuthStore.getState().setAuth({ id: "u", email: "a@b.c", demo: { expiresAt } }, "t");

    render(<DemoBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("5 год 12 хв");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByRole("status")).toHaveTextContent("5 год 11 хв");
  });

  it("never goes below zero once the account has expired", () => {
    const expiresAt = new Date(NOW.getTime() - 60_000).toISOString();
    useAuthStore.getState().setAuth({ id: "u", email: "a@b.c", demo: { expiresAt } }, "t");

    render(<DemoBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("0 год 0 хв");
  });
});

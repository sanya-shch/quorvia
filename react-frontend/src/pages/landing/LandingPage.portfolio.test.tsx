import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "./LandingPage";
import { authApi } from "../../api/auth";
import { useAuthStore } from "../../store/useAuthStore";

// The landing page of the portfolio build (VITE_IS_FOR_PORTFOLIO=true): the demo replaces sign-up.
vi.mock("../../config/portfolio", () => ({ IS_FOR_PORTFOLIO: true }));

vi.mock("../../api/auth", () => ({
  authApi: { demo: vi.fn(), warmUp: vi.fn().mockResolvedValue(undefined) },
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );

afterEach(() => useAuthStore.getState().clearAuth());

describe("LandingPage in the portfolio build", () => {
  it("offers the demo instead of registration and login, and wakes the backend", () => {
    renderPage();

    expect(screen.getAllByRole("button", { name: /Спробувати демо/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Створити форму" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Увійти" })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/register"]')).toBeNull();
    expect(document.querySelector('a[href="/login"]')).toBeNull();
    expect(authApi.warmUp).toHaveBeenCalled();
  });

  it("starts a demo account when the button is pressed", async () => {
    vi.mocked(authApi.demo).mockResolvedValue({
      accessToken: "t",
      user: { id: "u", email: "demo@demo.quorvia.invalid", demo: { expiresAt: "2099-01-01" } },
    });
    renderPage();

    await userEvent.click(screen.getAllByRole("button", { name: /Спробувати демо/ })[0]);

    expect(authApi.demo).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user?.demo?.expiresAt).toBe("2099-01-01");
  });

  it("still sends a signed-in user to the dashboard", () => {
    useAuthStore.getState().setAuth({ id: "u", email: "a@b.c" }, "token");
    renderPage();

    expect(screen.queryByRole("button", { name: /Спробувати демо/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Кабінет" })[0]).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});

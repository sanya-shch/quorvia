import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

const { restoreSession } = vi.hoisted(() => ({
  restoreSession: vi.fn(),
}));

vi.mock("../api/axios", () => ({ restoreSession }));

const { default: ProtectedRoute } = await import("./ProtectedRoute");

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={["/secret"]}>
        <Routes>
          <Route path="/login" element={<div>login-page</div>} />
          <Route
            path="/secret"
            element={
              <ProtectedRoute>
                <div>secret-page</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
  );

describe("ProtectedRoute (токен лише в пам'яті)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false, isInitialized: false });
  });

  it("після перезавантаження пробує відновити сесію й НЕ редіректить на /login, доки це триває", async () => {
    restoreSession.mockReturnValue(new Promise(() => {}));

    renderRoute();

    expect(restoreSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("login-page")).toBeNull();
    expect(screen.queryByText("secret-page")).toBeNull();
  });

  it("якщо відновити сесію не вдалося - редіректить на /login", async () => {
    restoreSession.mockImplementation(async () => {
      useAuthStore.getState().clearAuth();
      return null;
    });

    renderRoute();

    expect(await screen.findByText("login-page")).toBeTruthy();
  });

  it("якщо сесію відновлено - показує захищену сторінку", async () => {
    restoreSession.mockImplementation(async () => {
      act(() => useAuthStore.getState().setAuth({ id: "u1", email: "a@b.com" }, "fresh"));
      return "fresh";
    });

    renderRoute();

    await waitFor(() => expect(screen.getByText("secret-page")).toBeTruthy());
  });

  it("вже ініціалізована сесія з токеном не викликає restoreSession повторно", async () => {
    useAuthStore.setState({ token: "t", isAuthenticated: true, isInitialized: true });

    renderRoute();

    await waitFor(() => expect(screen.getByText("secret-page")).toBeTruthy());
    expect(restoreSession).not.toHaveBeenCalled();
  });
});

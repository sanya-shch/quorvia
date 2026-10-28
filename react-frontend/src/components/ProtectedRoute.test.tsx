import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "../store/useAuthStore";

const { restoreSession, getMe } = vi.hoisted(() => ({
  restoreSession: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock("../api/axios", () => ({ restoreSession }));
vi.mock("../api/auth", () => ({ authApi: { getMe } }));

const { default: ProtectedRoute } = await import("./ProtectedRoute");

const renderRoute = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
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
      </MemoryRouter>
    </QueryClientProvider>,
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
    getMe.mockResolvedValue({ id: "u1", email: "a@b.com" });
    restoreSession.mockImplementation(async () => {
      act(() => useAuthStore.getState().setToken("fresh"));
      return "fresh";
    });

    renderRoute();

    await waitFor(() => expect(screen.getByText("secret-page")).toBeTruthy());
  });

  it("вже ініціалізована сесія з токеном не викликає restoreSession повторно", async () => {
    getMe.mockResolvedValue({ id: "u1", email: "a@b.com" });
    useAuthStore.setState({ token: "t", isAuthenticated: true, isInitialized: true });

    renderRoute();

    await waitFor(() => expect(screen.getByText("secret-page")).toBeTruthy());
    expect(restoreSession).not.toHaveBeenCalled();
  });
});

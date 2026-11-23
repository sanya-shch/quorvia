import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { AxiosError, type AxiosResponse } from "axios";
import { authApi } from "../../api/auth";
import { useAuthStore } from "../../store/useAuthStore";
import Login from "./Login";

vi.mock("../../api/auth", () => ({ authApi: { login: vi.fn() } }));

const renderLogin = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<p>dashboard</p>} />
          <Route path="/" element={<p>home</p>} />
          <Route path="/register" element={<p>register page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.mocked(authApi.login).mockReset();
  useAuthStore.getState().clearAuth();
});

describe("Login", () => {
  it("shows the brand, the heading and the way to sign up", () => {
    renderLogin();

    expect(screen.getByText("Quorvia")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Увійдіть, щоб продовжити роботу",
    );
    expect(screen.getByRole("link", { name: "На головну" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Створити акаунт" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("shows and hides the password", async () => {
    const user = userEvent.setup();
    renderLogin();
    const field = screen.getByLabelText("Пароль");

    expect(field).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Показати пароль" }));
    expect(field).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Приховати пароль" }));
    expect(field).toHaveAttribute("type", "password");
  });

  it("shows validation messages and does not call the API with an empty form", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "Увійти" }));

    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it("signs in and opens the dashboard", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: "token",
      user: { id: "u1", email: "a@b.com" },
    });
    renderLogin();

    await user.type(screen.getByLabelText("Email адреса"), "a@b.com");
    await user.type(screen.getByLabelText("Пароль"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Увійти" }));

    expect(await screen.findByText("dashboard")).toBeInTheDocument();
    // react-query also passes its own context as a second argument: look at the payload only.
    expect(vi.mocked(authApi.login).mock.calls[0][0]).toEqual({
      email: "a@b.com",
      password: "Secret123",
    });
    expect(useAuthStore.getState().token).toBe("token");
  });

  it("shows the translated server error", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockRejectedValue(
      new AxiosError("fail", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 401,
        data: { message: "AUTH_INVALID_CREDENTIALS" },
      } as AxiosResponse),
    );
    renderLogin();

    await user.type(screen.getByLabelText("Email адреса"), "a@b.com");
    await user.type(screen.getByLabelText("Пароль"), "Wrong1234");
    await user.click(screen.getByRole("button", { name: "Увійти" }));

    await waitFor(() => expect(screen.getByText(/невірн|Невірн/)).toBeInTheDocument());
  });
});

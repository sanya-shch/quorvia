import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { authApi } from "../../api/auth";
import { useAuthStore } from "../../store/useAuthStore";
import Register from "./Register";

vi.mock("../../api/auth", () => ({ authApi: { register: vi.fn() } }));

const renderRegister = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <MemoryRouter initialEntries={["/register"]}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<p>dashboard</p>} />
          <Route path="/login" element={<p>login page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.mocked(authApi.register).mockReset();
  useAuthStore.getState().clearAuth();
});

describe("Register", () => {
  it("shows the brand, the heading, the password rule and the way to sign in", () => {
    renderRegister();

    expect(screen.getByText("Quorvia")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Створюйте розумніші форми з Quorvia",
    );
    expect(screen.getByText(/Щонайменше 8 символів/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Увійти" })).toHaveAttribute("href", "/login");
  });

  it("describes the password rule to the field for assistive technology", () => {
    renderRegister();

    const hint = screen.getByText(/Щонайменше 8 символів/);
    expect(screen.getByLabelText("Пароль")).toHaveAttribute("aria-describedby", hint.id);
  });

  it("rejects a weak password and different passwords without calling the API", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText("Email адреса"), "a@b.com");
    await user.type(screen.getByLabelText("Пароль"), "weak");
    await user.type(screen.getByLabelText("Підтвердження пароля"), "other");
    await user.click(screen.getByRole("button", { name: "Створити акаунт" }));

    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it("registers without sending the confirmation and opens the dashboard", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.register).mockResolvedValue({
      accessToken: "token",
      user: { id: "u1", email: "a@b.com" },
    });
    renderRegister();

    await user.type(screen.getByLabelText("Email адреса"), "a@b.com");
    await user.type(screen.getByLabelText("Пароль"), "Secret123");
    await user.type(screen.getByLabelText("Підтвердження пароля"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Створити акаунт" }));

    expect(await screen.findByText("dashboard")).toBeInTheDocument();
    // react-query also passes its own context as a second argument: look at the payload only.
    expect(vi.mocked(authApi.register).mock.calls[0][0]).toEqual({
      email: "a@b.com",
      password: "Secret123",
    });
  });
});

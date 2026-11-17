import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QUESTION_TYPES } from "@quorvia/shared-types";
import LandingPage from "./LandingPage";
import { useAuthStore } from "../../store/useAuthStore";

const renderPage = () =>
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );

afterEach(() => useAuthStore.getState().clearAuth());

describe("LandingPage", () => {
  it("shows the headline and sends a visitor to registration and login", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Форми, що думають далі за запитання.",
    );
    expect(screen.getByRole("link", { name: "Створити форму" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.getAllByRole("link", { name: "Увійти" })[0]).toHaveAttribute("href", "/login");
  });

  it("sends a signed-in user to the dashboard instead of registration", () => {
    useAuthStore.getState().setAuth({ id: "u1", email: "a@b.c" }, "token");
    renderPage();

    expect(screen.getAllByRole("link", { name: "Кабінет" })[0]).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.queryByRole("link", { name: "Увійти" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Створити форму" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("states the real number of question types, not a hardcoded one", () => {
    renderPage();

    expect(
      screen.getAllByText(new RegExp(`${QUESTION_TYPES.length} типами питань`)).length,
    ).toBeGreaterThan(0);
  });

  it("has the sections the navigation points at", () => {
    const { container } = renderPage();

    for (const id of ["features", "use-cases", "how-it-works"]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });
});

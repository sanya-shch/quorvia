import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, applyTheme } from "../../theme/theme";
import ThemeToggle from "./ThemeToggle";

const root = document.documentElement;

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => applyTheme("light"));
  });

  afterEach(() => {
    delete root.dataset.theme;
  });

  it("у світлій темі пропонує темну й навпаки; назва кнопки каже, що станеться", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /темну тему|dark theme/i });
    await user.click(button);

    expect(root.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("button", { name: /світлу тему|light theme/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /світлу тему|light theme/i }));

    expect(root.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: /темну тему|dark theme/i })).toBeInTheDocument();
  });

  it("іконка декоративна: ховається від скрінрідера, значення несе назва кнопки", () => {
    const { container } = render(<ThemeToggle />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("підхоплює тему, змінену ззовні (системна зміна, інша вкладка)", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: /темну тему|dark theme/i })).toBeInTheDocument();

    act(() => applyTheme("dark"));

    expect(screen.getByRole("button", { name: /світлу тему|light theme/i })).toBeInTheDocument();
  });
});

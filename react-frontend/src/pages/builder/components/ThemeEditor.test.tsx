import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormTheme } from "@quorvia/shared-types";
import ThemeEditor from "./ThemeEditor";

vi.mock("../../viewer/theme/fonts", () => ({
  useThemeFont: () => undefined,
  loadFont: () => Promise.resolve(),
}));

const setup = (theme: FormTheme | null = null) => {
  const onChange = vi.fn();
  render(<ThemeEditor theme={theme} onChange={onChange} />);

  return { onChange, user: userEvent.setup() };
};

const hexField = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe("ThemeEditor", () => {
  it("shows the default light palette for no theme", () => {
    setup(null);

    expect(hexField("Основний колір")).toHaveValue("#4f46e5");
    expect(hexField("Фон")).toHaveValue("#f8fafc");
    expect(hexField("Текст")).toHaveValue("#0f172a");
    expect(screen.getByRole("button", { name: "Світла" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switching to the dark mode shows the dark defaults and stores only the mode", async () => {
    const { onChange, user } = setup(null);

    await user.click(screen.getByRole("button", { name: "Темна" }));

    expect(onChange).toHaveBeenCalledWith({ mode: "dark" });
  });

  it("commits a valid hex color, lowercased", async () => {
    const { onChange, user } = setup(null);
    const field = hexField("Основний колір");

    await user.clear(field);
    await user.type(field, "#FF0000");

    expect(onChange).toHaveBeenLastCalledWith({ primaryColor: "#ff0000" });
  });

  it("keeps the other settings when one changes", async () => {
    const { onChange, user } = setup({ mode: "dark", radius: "small" });

    await user.selectOptions(screen.getByLabelText("Шрифт"), "lora");

    expect(onChange).toHaveBeenCalledWith({ mode: "dark", radius: "small", font: "lora" });
  });

  it("does not commit a half-typed or invalid color and says why", async () => {
    const { onChange, user } = setup(null);
    const field = hexField("Фон");

    await user.clear(field);
    await user.type(field, "#12");

    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("шестизначний hex-колір");
  });

  it("rejects values that are not plain hex, such as CSS", async () => {
    const { onChange, user } = setup(null);
    const field = hexField("Текст");

    await user.clear(field);
    // maxLength keeps the field short, and nothing that is not #rrggbb is ever committed.
    await user.type(field, "red");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("offers the default only for a customized color and removes just that color", async () => {
    const { onChange, user } = setup({ primaryColor: "#ff0000", radius: "none" });

    expect(screen.getAllByRole("button", { name: "Типовий" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Типовий" }));

    expect(onChange).toHaveBeenCalledWith({ radius: "none" });
  });

  it("removing the last customized value clears the theme", async () => {
    const { onChange, user } = setup({ primaryColor: "#ff0000" });

    await user.click(screen.getByRole("button", { name: "Типовий" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("changes the corner radius", async () => {
    const { onChange, user } = setup(null);

    await user.click(screen.getByRole("button", { name: "Великі" }));

    expect(onChange).toHaveBeenCalledWith({ radius: "large" });
  });

  it("disables the reset when there is nothing to reset", () => {
    setup(null);

    expect(screen.getByRole("button", { name: "Скинути оформлення до типового" })).toBeDisabled();
  });

  it("resets a customized theme to none", async () => {
    const { onChange, user } = setup({ mode: "dark" });

    await user.click(screen.getByRole("button", { name: "Скинути оформлення до типового" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows no warnings for readable colors", () => {
    setup({ mode: "dark" });

    expect(screen.queryByText("Попередження про читабельність")).not.toBeInTheDocument();
  });

  it("warns about low contrast", () => {
    setup({ textColor: "#cccccc" });

    expect(screen.getByRole("status")).toHaveTextContent("Колір тексту важко читати");
  });

  it("renders a live preview with the chosen colors", () => {
    const { container } = render(
      <ThemeEditor
        theme={{ primaryColor: "#ff0000", backgroundColor: "#000000", textColor: "#ffffff" }}
        onChange={vi.fn()}
      />,
    );
    const scope = container.querySelector<HTMLElement>(".q-theme")!;

    expect(scope).toContainElement(screen.getByTestId("theme-preview"));
    expect(scope.style.getPropertyValue("--q-primary")).toBe("#ff0000");
    expect(scope.style.getPropertyValue("--q-bg")).toBe("#000000");
  });
});

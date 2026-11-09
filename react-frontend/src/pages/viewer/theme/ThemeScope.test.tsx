import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ThemeScope from "./ThemeScope";

const { loadFont } = vi.hoisted(() => ({
  loadFont: vi.fn<(font: string) => Promise<void>>(() => Promise.resolve()),
}));

vi.mock("./fonts", async () => {
  const { useEffect } = await import("react");

  return {
    loadFont,
    useThemeFont: (font: string) => {
      useEffect(() => {
        void loadFont(font);
      }, [font]);
    },
  };
});

const renderScope = (theme: unknown) =>
  render(
    <ThemeScope theme={theme}>
      <p>content</p>
    </ThemeScope>,
  );

describe("ThemeScope", () => {
  beforeEach(() => {
    loadFont.mockClear();
  });

  it.each([null, undefined, {}, "dark", []])("renders the children untouched for %j", (theme) => {
    const { container } = renderScope(theme);

    expect(container.querySelector(".q-theme")).toBeNull();
    expect(screen.getByText("content").parentElement).toBe(container);
  });

  it("wraps the children in a themed element with variables and a radius", () => {
    const { container } = renderScope({
      mode: "dark",
      primaryColor: "#FF0000",
      radius: "large",
      font: "lora",
    });
    const scope = container.querySelector<HTMLElement>(".q-theme")!;

    expect(scope).toContainElement(screen.getByText("content"));
    expect(scope.dataset.qRadius).toBe("large");
    expect(scope.style.getPropertyValue("--q-primary")).toBe("#ff0000");
    expect(scope.style.getPropertyValue("--q-bg")).toBe("#0f172a");
    expect(scope.style.getPropertyValue("--q-font")).toContain("Lora");
    expect(scope.style.colorScheme).toBe("dark");
  });

  it("loads the selected font", () => {
    renderScope({ font: "inter" });

    expect(loadFont).toHaveBeenCalledWith("inter");
  });

  it("drops hostile values instead of putting them into the style", () => {
    const { container } = renderScope({
      primaryColor: "#ffffff; background:url(//evil.test/x)",
      textColor: "#000000",
      font: "Arial; src:url(//evil.test/font)",
      customCss: "body{display:none}",
    });
    const scope = container.querySelector<HTMLElement>(".q-theme")!;

    expect(scope.getAttribute("style")).not.toContain("evil");
    expect(scope.getAttribute("style")).not.toContain("url(");
    // The valid color survives, the invalid one falls back to the default palette.
    expect(scope.style.getPropertyValue("--q-text")).toBe("#000000");
    expect(scope.style.getPropertyValue("--q-primary")).toBe("#4f46e5");
  });

  it("renders unthemed when every value is hostile", () => {
    const { container } = renderScope({ primaryColor: "red", backgroundColor: "url(x)" });

    expect(container.querySelector(".q-theme")).toBeNull();
  });
});

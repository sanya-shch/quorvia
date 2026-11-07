import { describe, expect, it } from "vitest";
import {
  DEFAULT_PALETTES,
  FONT_STACKS,
  contrastRatio,
  getThemeWarnings,
  luminance,
  mixColors,
  onColorFor,
  resolveTheme,
  themeStyle,
} from "./theme";

describe("color math", () => {
  it("luminance of black and white", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("contrast ratio matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // #767676 is the classic lightest gray that still passes 4.5:1 on white.
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#123456", "#fedcba")).toBeCloseTo(contrastRatio("#fedcba", "#123456"), 10);
  });

  it("mixes colors in sRGB", () => {
    expect(mixColors("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixColors("#102030", "#ffffff", 0)).toBe("#102030");
    expect(mixColors("#102030", "#ffffff", 1)).toBe("#ffffff");
  });

  it("picks white or near-black for text on a background", () => {
    expect(onColorFor("#4f46e5")).toBe("#ffffff");
    expect(onColorFor("#fde047")).toBe("#0f172a");
    expect(onColorFor("#000000")).toBe("#ffffff");
    expect(onColorFor("#ffffff")).toBe("#0f172a");
  });
});

describe("resolveTheme", () => {
  it("uses the light palette for no theme", () => {
    const resolved = resolveTheme(null);

    expect(resolved.palette).toEqual(DEFAULT_PALETTES.light);
    expect(resolved).toMatchObject({ isDark: false, surface: "#ffffff", font: "system", radius: "medium" });
  });

  it("uses the dark palette and a lifted surface in dark mode", () => {
    const resolved = resolveTheme({ mode: "dark" });

    expect(resolved.palette).toEqual(DEFAULT_PALETTES.dark);
    expect(resolved.isDark).toBe(true);
    expect(resolved.surface).not.toBe("#ffffff");
    expect(luminance(resolved.surface)).toBeGreaterThan(luminance(resolved.palette.background));
  });

  it("lets custom colors override the mode defaults", () => {
    const resolved = resolveTheme({ mode: "dark", primaryColor: "#ff0000" });

    expect(resolved.palette.primary).toBe("#ff0000");
    expect(resolved.palette.background).toBe(DEFAULT_PALETTES.dark.background);
  });

  it("judges dark from the colors in use, not from the mode", () => {
    expect(resolveTheme({ mode: "light", backgroundColor: "#000000", textColor: "#ffffff" }).isDark).toBe(true);
    expect(resolveTheme({ mode: "dark", backgroundColor: "#ffffff", textColor: "#000000" }).isDark).toBe(false);
  });
});

describe("themeStyle", () => {
  it("emits only validated hex colors and our own font stacks", () => {
    const style = themeStyle(resolveTheme({ mode: "dark", font: "lora", primaryColor: "#aabbcc" })) as Record<
      string,
      string
    >;

    for (const key of ["--q-primary", "--q-bg", "--q-text", "--q-surface", "--q-on-primary"]) {
      expect(style[key]).toMatch(/^#[0-9a-f]{6}$/);
    }

    expect(style["--q-font"]).toBe(FONT_STACKS.lora);
    expect(style.colorScheme).toBe("dark");
  });
});

describe("getThemeWarnings", () => {
  it("has nothing to say about the default palettes", () => {
    expect(getThemeWarnings(null)).toEqual([]);
    expect(getThemeWarnings({ mode: "dark" })).toEqual([]);
  });

  it("warns about unreadable text", () => {
    expect(getThemeWarnings({ textColor: "#cccccc" })).toContain("textContrast");
  });

  it("warns when the page and cards cannot both show the text", () => {
    // Fine on the page, but the white card makes light gray text unreadable.
    expect(getThemeWarnings({ backgroundColor: "#1e293b", textColor: "#64748b" })).toContain("textContrast");
  });

  it("warns when text on a primary button cannot be read", () => {
    // A mid-tone gray (luminance about 0.2): neither white nor near-black reaches 4.5:1 on it.
    expect(getThemeWarnings({ primaryColor: "#7c7c7c" })).toContain("primaryContrast");
  });

  it("warns when the primary color disappears into the background", () => {
    expect(getThemeWarnings({ primaryColor: "#f1f5f9" })).toContain("primaryVisibility");
  });
});

import type { CSSProperties } from "react";
import type { FormFont, FormRadius, FormTheme, FormThemeMode } from "@quorvia/shared-types";

export type Palette = { primary: string; background: string; text: string };

// Defaults per mode; a theme only stores what the author changed.
export const DEFAULT_PALETTES: Record<FormThemeMode, Palette> = {
  light: { primary: "#4f46e5", background: "#f8fafc", text: "#0f172a" },
  dark: { primary: "#818cf8", background: "#0f172a", text: "#f1f5f9" },
};

export const DEFAULT_FONT: FormFont = "system";
export const DEFAULT_RADIUS: FormRadius = "medium";

// Self-hosted fonts (see fonts.ts); the rest of each stack is the fallback while they load.
export const FONT_STACKS: Record<FormFont, string> = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
  lora: '"Lora", Georgia, "Times New Roman", serif',
  "jetbrains-mono": '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

const toRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const toHex = ([r, g, b]: [number, number, number]): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

// WCAG relative luminance.
export const luminance = (hex: string): number => {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// WCAG contrast ratio, 1 (identical) to 21 (black on white).
export const contrastRatio = (a: string, b: string): number => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];

  return (lighter + 0.05) / (darker + 0.05);
};

// Blends `top` over `base` (amount 0..1 of `top`), in sRGB like CSS color-mix in srgb.
export const mixColors = (base: string, top: string, amount: number): string => {
  const [b, t] = [toRgb(base), toRgb(top)];

  return toHex([0, 1, 2].map((i) => b[i]! + (t[i]! - b[i]!) * amount) as [number, number, number]);
};

// Text color on top of the primary color: whichever of white / near-black reads better.
export const onColorFor = (background: string): string =>
  contrastRatio("#ffffff", background) >= contrastRatio("#0f172a", background)
    ? "#ffffff"
    : "#0f172a";

export type ResolvedTheme = {
  palette: Palette;
  surface: string;
  onPrimary: string;
  isDark: boolean;
  font: FormFont;
  radius: FormRadius;
};

export const resolveTheme = (theme: FormTheme | null | undefined): ResolvedTheme => {
  const defaults = DEFAULT_PALETTES[theme?.mode ?? "light"];
  const palette: Palette = {
    primary: theme?.primaryColor ?? defaults.primary,
    background: theme?.backgroundColor ?? defaults.background,
    text: theme?.textColor ?? defaults.text,
  };

  // "Dark" is judged from the colors in use, not from the mode: custom colors may flip it.
  const isDark = luminance(palette.text) > luminance(palette.background);

  return {
    palette,
    // Cards: white on a light page, slightly lifted from the page color on a dark one.
    surface: isDark ? mixColors(palette.background, "#ffffff", 0.1) : "#ffffff",
    onPrimary: onColorFor(palette.primary),
    isDark,
    font: theme?.font ?? DEFAULT_FONT,
    radius: theme?.radius ?? DEFAULT_RADIUS,
  };
};

// Custom properties the stylesheet (viewerTheme.css) derives the whole palette from. Every value
// is either a validated hex color or one of our own font stacks, never author-supplied text.
export const themeStyle = (resolved: ResolvedTheme): CSSProperties =>
  ({
    "--q-primary": resolved.palette.primary,
    "--q-bg": resolved.palette.background,
    "--q-text": resolved.palette.text,
    "--q-surface": resolved.surface,
    "--q-on-primary": resolved.onPrimary,
    "--q-font": FONT_STACKS[resolved.font],
    colorScheme: resolved.isDark ? "dark" : "light",
  }) as CSSProperties;

export type ThemeWarning = "textContrast" | "primaryContrast" | "primaryVisibility";

const MIN_TEXT_CONTRAST = 4.5;
const MIN_UI_CONTRAST = 3;

// Contrast problems the author should know about before publishing.
export const getThemeWarnings = (theme: FormTheme | null | undefined): ThemeWarning[] => {
  const resolved = resolveTheme(theme);
  const { palette, surface, onPrimary } = resolved;
  const warnings: ThemeWarning[] = [];

  // Text sits on the page and on the cards, so the weaker of the two decides.
  const textContrast = Math.min(
    contrastRatio(palette.text, palette.background),
    contrastRatio(palette.text, surface),
  );

  if (textContrast < MIN_TEXT_CONTRAST) warnings.push("textContrast");
  if (contrastRatio(onPrimary, palette.primary) < MIN_TEXT_CONTRAST)
    warnings.push("primaryContrast");

  // Buttons, borders and selected states must stand out from what is behind them.
  const primaryVisibility = Math.min(
    contrastRatio(palette.primary, palette.background),
    contrastRatio(palette.primary, surface),
  );

  if (primaryVisibility < MIN_UI_CONTRAST) warnings.push("primaryVisibility");

  return warnings;
};

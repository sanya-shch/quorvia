/// <reference types="node" />
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Read from disk: the CSS pipeline of the test environment turns stylesheet imports into empty modules.
const css = fs.readFileSync(path.resolve(import.meta.dirname, "viewerTheme.css"), "utf8");

// The theme works by re-pointing Tailwind palette variables, so a viewer component that starts
// using a palette step the stylesheet does not map would silently ignore the author's colors.
// This keeps the two in step.
const sources = import.meta.glob(
  ["../*.tsx", "../components/*.tsx", "!../**/*.test.tsx"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const TOKEN =
  /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|divide|accent|fill|stroke|from|to|via|outline|placeholder|decoration|shadow)-(slate|indigo)-(\d{2,3})(?!\d)/g;

const usedTokens = (): Map<string, Set<string>> => {
  const used = new Map<string, Set<string>>();

  for (const [file, source] of Object.entries(sources)) {
    for (const match of source.matchAll(TOKEN)) {
      const token = `${match[1]}-${match[2]}`;
      used.set(token, (used.get(token) ?? new Set()).add(file.split("/").pop()!));
    }
  }

  return used;
};

describe("viewerTheme.css", () => {
  it("scans the viewer sources", () => {
    // Guards the glob itself: an empty scan would make the checks below pass for nothing.
    expect(Object.keys(sources).length).toBeGreaterThan(8);
    expect(usedTokens().size).toBeGreaterThan(10);
  });

  it("maps every slate and indigo step used by the public form", () => {
    const missing = [...usedTokens()]
      .filter(([token]) => !css.includes(`--color-${token}:`))
      .map(([token, files]) => `${token} (${[...files].join(", ")})`);

    expect(missing).toEqual([]);
  });

  it("does not use plain white or black utilities in the viewer (they ignore the theme)", () => {
    const offenders = Object.entries(sources)
      .filter(([, source]) => /(?<![\w-])(bg|text|border)-(white|black)(?![\w-])/.test(source))
      .map(([file]) => file.split("/").pop());

    expect(offenders).toEqual([]);
  });

  it("defines the surface and on-primary colors and all radius presets", () => {
    expect(css).toContain("--color-surface:");
    expect(css).toContain("--color-on-primary:");

    for (const radius of ["none", "small", "large"]) {
      expect(css).toContain(`data-q-radius="${radius}"`);
    }
  });
});

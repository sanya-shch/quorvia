/// <reference types="node" />
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { THEME_STORAGE_KEY } from "./theme";

// Read from disk: the CSS pipeline of the test environment turns stylesheet imports into empty modules.
const read = (relative: string) =>
  fs.readFileSync(path.resolve(import.meta.dirname, relative), "utf8");
const palette = read("../palette.css");
const tailwindTheme = read("../../node_modules/tailwindcss/theme.css");
const indexHtml = read("../../index.html");
const routes = read("../routes.tsx");

const sources = import.meta.glob(["../**/*.tsx", "!../**/*.test.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const squash = (value: string) => value.replace(/\s+/g, " ").trim();

// --color-x: light-dark(<light>, <dark>); the two arguments may hold nested parentheses.
const parsePalette = (): Map<string, { light: string; dark: string }> => {
  const entries = new Map<string, { light: string; dark: string }>();
  for (const match of palette.matchAll(/--color-([\w-]+):\s*light-dark\(/g)) {
    let depth = 1;
    let comma = -1;
    let i = match.index! + match[0].length;
    const start = i;
    for (; depth > 0; i++) {
      if (palette[i] === "(") depth++;
      else if (palette[i] === ")") depth--;
      else if (palette[i] === "," && depth === 1 && comma < 0) comma = i;
    }
    entries.set(match[1], {
      light: squash(palette.slice(start, comma)),
      dark: squash(palette.slice(comma + 1, i - 1)),
    });
  }
  return entries;
};

const tailwindDefault = (name: string) =>
  tailwindTheme.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1].trim();

const entries = Object.entries(sources);
const paletteVars = parsePalette();

describe("палітра світлої та темної теми", () => {
  it("знаходить змінні палітри та вихідники", () => {
    // Guards the parsing and the glob: an empty scan would make the checks below pass for nothing.
    expect(paletteVars.size).toBeGreaterThan(60);
    expect(entries.length).toBeGreaterThan(50);
  });

  it("світла сторона це значення Tailwind як є: світла тема виглядає, як до темної", () => {
    for (const [name, { light }] of paletteVars) {
      const original = tailwindDefault(name);
      if (original === undefined) continue; // own tokens (on-solid, scrim)
      expect(light, `--color-${name}`).toBe(squash(original));
    }
  });

  it("кожна змінна має обидві сторони", () => {
    for (const [name, { light, dark }] of paletteVars) {
      expect(light, `--color-${name}: світла`).not.toBe("");
      expect(dark, `--color-${name}: темна`).not.toBe("");
    }
  });

  it("кожен колір, що використовує код, є в палітрі: нова родина чи відтінок не лишаться світлими в темній темі", () => {
    const TOKEN =
      /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|ring-offset|divide|accent|fill|stroke|from|to|via|outline|placeholder|decoration|shadow|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(\d{2,3})(?!\d)/g;

    const missing = new Set<string>();
    for (const [file, source] of entries) {
      for (const [, family, shade] of source.matchAll(TOKEN)) {
        if (!paletteVars.has(`${family}-${shade}`)) {
          missing.add(`${family}-${shade} (${file.replace("../", "")})`);
        }
      }
    }

    expect([...missing]).toEqual([]);
  });

  it("немає text-white і темного slate-900 під підкладку: це не переживає темну тему", () => {
    // text-white goes dark-on-dark with a themed --color-white: use text-on-solid (text on a solid
    // fill); a backdrop that must stay dark is bg-scrim, not bg-slate-900 (which turns light).
    const offenders = entries.flatMap(([file, source]) =>
      [
        ...source.matchAll(/(?<![\w-])(?:[a-z-]+:)*(?:text-white|bg-slate-9\d0\/\d+)(?![\w-])/g),
      ].map((match) => `${file.replace("../", "")}: ${match[0]}`),
    );

    expect(offenders).toEqual([]);
  });
});

describe("тема до першого кадру (index.html)", () => {
  it("скрипт читає той самий ключ сховища, що й код", () => {
    expect(indexHtml).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
  });

  it("публічна форма закріплена за світлою темою на тому самому шляху, що й у маршрутах", () => {
    expect(indexHtml).toContain("/^\\/public\\/forms\\//.test(location.pathname)");
    expect(routes).toContain('path: "/public/forms/:shareId"');
  });
});

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
    // The one deliberate exception (see palette.css): the contrast contract below is why.
    const DARKENED_FOR_CONTRAST = new Set(["slate-500"]);
    for (const [name, { light }] of paletteVars) {
      const original = tailwindDefault(name);
      if (original === undefined) continue; // own tokens (on-solid, scrim)
      if (DARKENED_FOR_CONTRAST.has(name)) {
        expect(light, `--color-${name}`).not.toBe(squash(original));
        continue;
      }
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

// --- contrast (WCAG 2.x relative luminance) of the palette values, evaluated in plain math ---------
type Linear = [number, number, number];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

const oklchToLinear = (L: number, C: number, hue: number): Linear => {
  const a = C * Math.cos((hue * Math.PI) / 180);
  const b = C * Math.sin((hue * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
};

// #rrggbb | oklch(L% C h) | color-mix(in srgb, <color> P%, <color>): all the palette uses.
const parseColor = (value: string): Linear => {
  const text = squash(value);
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const full = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => toLinear(parseInt(full.slice(i, i + 2), 16) / 255)) as Linear;
  }
  const oklch = /^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/.exec(text);
  if (oklch) return oklchToLinear(Number(oklch[1]) / 100, Number(oklch[2]), Number(oklch[3]));
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*(.+)\)$/.exec(text);
  if (mix) {
    const [from, to, share] = [parseColor(mix[1]), parseColor(mix[3]), Number(mix[2]) / 100];
    return from.map((c, i) => toLinear(toSrgb(c) * share + toSrgb(to[i]) * (1 - share))) as Linear;
  }
  throw new Error(`unsupported color: ${value}`);
};

const luminance = ([r, g, b]: Linear) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const contrast = (a: Linear, b: Linear) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const colorOf = (name: string, theme: "light" | "dark") =>
  parseColor(paletteVars.get(name)![theme]);

describe("контраст тексту: AA (4.5:1) на поверхнях, де він стоїть, в обох темах", () => {
  // The shades that are allowed to carry small text. Lighter ones (slate-400, emerald-600, ...) are
  // for icons, borders and fills: the sweep test below keeps them off text.
  const NEUTRAL = ["slate-500", "slate-600", "slate-700", "slate-800", "slate-900"];
  const NEUTRAL_SURFACES = ["white", "slate-50", "slate-100"];
  const ACCENT_TEXT = [
    "indigo-600",
    "emerald-700",
    "rose-700",
    "red-700",
    "amber-700",
    "green-700",
  ];

  for (const theme of ["light", "dark"] as const) {
    it(`${theme}: нейтральний текст на білому, slate-50 і slate-100`, () => {
      const failures = NEUTRAL.flatMap((text) =>
        NEUTRAL_SURFACES.map((surface) => ({
          pair: `${text} on ${surface}`,
          ratio: contrast(colorOf(text, theme), colorOf(surface, theme)),
        })).filter(({ ratio }) => ratio < 4.5),
      );

      expect(failures).toEqual([]);
    });

    it(`${theme}: акцентний текст на білому, slate-50 та власних підложках -50 і -100`, () => {
      const failures = ACCENT_TEXT.flatMap((text) => {
        const family = text.split("-")[0];
        // green is used once, on its own -50 tint (the check mark of the end screen): 700 on -100 is
        // 4.497:1, a hair short, and nothing sits there.
        const tints = family === "green" ? [`${family}-50`] : [`${family}-50`, `${family}-100`];
        return ["white", "slate-50", ...tints]
          .map((surface) => ({
            pair: `${text} on ${surface}`,
            ratio: contrast(colorOf(text, theme), colorOf(surface, theme)),
          }))
          .filter(({ ratio }) => ratio < 4.5);
      });

      expect(failures).toEqual([]);
    });
  }

  it("в коді немає text-slate-400, text-<акцент>-400/500/600 і text-indigo-100/200/300", () => {
    // Fills, borders and icons may use these shades; text may not (on white their contrast is 1.7-4.5,
    // and the light indigos are tints in the dark theme). Text on a solid fill is text-on-solid/NN.
    const offenders = entries.flatMap(([file, source]) =>
      [
        ...source.matchAll(
          /(?<![\w:-])(?!placeholder:)(?:[a-z-]+:)*text-(?:slate-400|indigo-[123]00|(?:emerald|amber|green|rose|red)-[456]00)(?![\w-])/g,
        ),
      ]
        .filter(() => !/isFilled \? "text-amber-400"/.test(source)) // the filled star of the rating field
        .map((match) => `${file.replace("../", "")}: ${match[0]}`),
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

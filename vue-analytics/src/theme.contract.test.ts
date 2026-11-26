import { describe, expect, it } from "vitest";
import hostPalette from "../../react-frontend/src/palette.css?raw";

// The remote mounts into the host's DOM, so its colors follow the host's light/dark theme only if
// they are the host's palette variables. This keeps them that way.
const sources = import.meta.glob(["./**/*.vue"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const entries = Object.entries(sources);
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const styleBlocks = (source: string) =>
  [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => strip(match[1]));

// A diagram accent that is not a palette color.
const ALLOWED_HEX = new Set(["#7c6ff0"]);

const hostVariables = new Set(
  [...strip(hostPalette).matchAll(/(--color-[\w-]+):/g)].map((match) => match[1]),
);

describe("кольори ремоута йдуть за темою хоста", () => {
  it("сканує компоненти й палітру хоста", () => {
    // Guards the glob and the import: an empty scan would make the checks below pass for nothing.
    expect(entries.length).toBeGreaterThan(15);
    expect(hostVariables.size).toBeGreaterThan(60);
  });

  it("у стилях і шаблонах немає hex-кольорів поза var(--color-*, fallback)", () => {
    const offenders = entries.flatMap(([file, source]) => {
      const withoutVars = strip(source).replace(/var\([^()]*\)/g, "");
      return [...withoutVars.matchAll(/#[0-9a-fA-F]{3,8}(?![\w-])/g)]
        .map((match) => match[0].toLowerCase())
        .filter((hex) => !ALLOWED_HEX.has(hex))
        .map((hex) => `${file}: ${hex}`);
    });

    expect(offenders).toEqual([]);
  });

  it("у стилях немає ключового слова white: це --color-white або --color-on-solid", () => {
    const offenders = entries.flatMap(([file, source]) =>
      styleBlocks(source).flatMap((css) =>
        [...css.replace(/var\([^()]*\)/g, "").matchAll(/(?<![\w#-])white(?![\w-])/g)].map(
          () => `${file}: white`,
        ),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("кожна використана змінна --color-* існує в палітрі хоста", () => {
    const used = new Set(
      entries.flatMap(([, source]) =>
        [...source.matchAll(/var\((--color-[\w-]+)/g)].map((match) => match[1]),
      ),
    );

    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((name) => !hostVariables.has(name))).toEqual([]);
  });
});

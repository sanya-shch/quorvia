/// <reference types="node" />
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Read from disk: the CSS pipeline of the test environment turns stylesheet imports into empty modules.
const css = fs.readFileSync(path.resolve(import.meta.dirname, "../../index.css"), "utf8");

const sources = import.meta.glob(["../../**/*.tsx", "!../../**/*.test.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// Utilities of tailwindcss-animate / tw-animate-css. The project has neither, so these classes are
// silently ignored: an element that carries one looks animated in the code and is not on screen.
const NOT_INSTALLED =
  /(?<![\w-])(?:animate-(?:in|out|fade-in|fade-out)|fade-(?:in|out)|zoom-(?:in|out)(?:-\d+)?|slide-(?:in|out)-(?:from|to)-[\w-]+)(?![\w-])/g;

const USED_MOTION_CLASS = /(?<![\w-])motion-[a-z][\w-]*(?![\w-])/g;

const entries = Object.entries(sources);

describe("класи анімацій", () => {
  it("сканує вихідники", () => {
    // Guards the glob itself: an empty scan would make the checks below pass for nothing.
    expect(entries.length).toBeGreaterThan(50);
  });

  it("немає класів animate-in / fade-in / zoom-in / slide-in-from-*: плагіна для них нема", () => {
    const offenders = entries.flatMap(([file, source]) =>
      [...source.matchAll(NOT_INSTALLED)].map((m) => `${file.replace("../../", "")}: ${m[0]}`),
    );

    expect(offenders).toEqual([]);
  });

  it("кожен motion-* клас із коду визначений в index.css", () => {
    const defined = new Set([...css.matchAll(/\.(motion-[a-z][\w-]*)/g)].map((m) => m[1]));
    const missing = entries.flatMap(([file, source]) =>
      [...new Set(source.match(USED_MOTION_CLASS) ?? [])]
        .filter((name) => !defined.has(name))
        .map((name) => `${file.replace("../../", "")}: ${name}`),
    );

    expect(defined.size).toBeGreaterThan(8);
    expect(missing).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import hostCss from "../../react-frontend/src/index.css?raw";
import remoteCss from "./motion.css?raw";

// The remote is built on its own, so motion.css repeats the host's tokens as var() fallbacks. This
// test is the guard against the two drifting apart: change a token in the host's index.css and it
// fails until the fallback here follows.
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

const hostTokens = (): Map<string, string> => {
  const root = /:root\s*\{([^}]*)\}/.exec(stripComments(hostCss))?.[1] ?? "";
  const tokens = new Map<string, string>();
  for (const [, name, value] of root.matchAll(/(--motion-[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(name, normalize(value));
  }
  return tokens;
};

// --motion-index is not a token: each block sets its own place in the cascade inline.
const PER_ELEMENT = new Set(["--motion-index"]);

// var(--motion-x, fallback); the fallback may hold one level of parentheses (cubic-bezier(...)).
const remoteFallbacks = (): Array<[string, string]> =>
  [...stripComments(remoteCss).matchAll(/var\((--motion-[\w-]+),\s*((?:[^()]|\([^()]*\))+)\)/g)]
    .filter(([, name]) => !PER_ELEMENT.has(name))
    .map(([, name, fallback]) => [name, normalize(fallback)]);

describe("токени руху: ремоут і хост", () => {
  it("знаходить токени хоста та fallback-значення ремоута", () => {
    expect(hostTokens().size).toBeGreaterThanOrEqual(6);
    expect(remoteFallbacks().length).toBeGreaterThanOrEqual(6);
  });

  it("кожен fallback у motion.css дорівнює токену хоста", () => {
    const host = hostTokens();

    for (const [name, fallback] of remoteFallbacks()) {
      expect(host.get(name), `${name} відсутній у :root хоста`).toBeDefined();
      expect(fallback, name).toBe(host.get(name));
    }
  });
});

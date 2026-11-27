/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { inlineScriptHashes } from "./csp";

const indexHtml = fs.readFileSync(path.resolve(import.meta.dirname, "../../index.html"), "utf8");
const sha256 = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

describe("inlineScriptHashes", () => {
  it("хешує текст інлайн-скрипта точно, байт у байт", () => {
    const body = "\n  var a = 1;\n";

    expect(inlineScriptHashes(`<head><script>${body}</script></head>`)).toEqual([sha256(body)]);
  });

  it("пропускає скрипти із src та порожні", () => {
    const html = '<script type="module" src="/a.js"></script><script></script><script> </script>';

    expect(inlineScriptHashes(html)).toEqual([]);
  });

  it("кілька інлайн-скриптів дають кілька хешів", () => {
    expect(inlineScriptHashes("<script>a()</script><script>b()</script>")).toEqual([
      sha256("a()"),
      sha256("b()"),
    ]);
  });

  it("скрипт теми з index.html потрапляє під хеш, а модульний бандл ні", () => {
    const hashes = inlineScriptHashes(indexHtml);

    expect(hashes).toHaveLength(1);
    const script = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/.exec(indexHtml)![1];
    expect(script).toContain("quorvia-theme");
    expect(hashes[0]).toBe(sha256(script));
  });
});

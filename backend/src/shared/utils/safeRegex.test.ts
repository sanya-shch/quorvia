import { describe, expect, it } from "vitest";
import { compileSafePattern, MAX_PATTERN_LENGTH } from "./safeRegex.js";

describe("compileSafePattern", () => {
  it("компілює звичайний шаблон і перевіряє значення", () => {
    const re = compileSafePattern("^[A-Z]{2}\\d{4}$");

    expect(re?.test("AB1234")).toBe(true);
    expect(re?.test("ab1234")).toBe(false);
  });

  it("катастрофічний шаблон виконується за лінійний час (немає ReDoS)", () => {
    const re = compileSafePattern("^(a+)+$");
    const started = Date.now();

    expect(re?.test("a".repeat(5_000) + "b")).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("відхиляє непідтримувані конструкції (lookahead, backreference)", () => {
    expect(compileSafePattern("(?=a)b")).toBeNull();
    expect(compileSafePattern("(a)\\1")).toBeNull();
  });

  it("відхиляє невалідний і задовгий шаблон", () => {
    expect(compileSafePattern("([")).toBeNull();
    expect(compileSafePattern("a".repeat(MAX_PATTERN_LENGTH + 1))).toBeNull();
  });
});

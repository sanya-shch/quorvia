import { describe, expect, it } from "vitest";
import { getScaleBounds, isScaleQuestionType } from "@quorvia/shared-types";

describe("getScaleBounds", () => {
  it("NPS завжди 0..10 і ігнорує config", () => {
    expect(getScaleBounds("NPS", null)).toEqual({ min: 0, max: 10 });
    expect(getScaleBounds("NPS", { min: 1, max: 5 })).toEqual({ min: 0, max: 10 });
  });

  it("RATING: 1..max, типово 5", () => {
    expect(getScaleBounds("RATING", null)).toEqual({ min: 1, max: 5 });
    expect(getScaleBounds("RATING", { max: 7 })).toEqual({ min: 1, max: 7 });
  });

  it("RATING: некоректний max (поза 3..10, не ціле) замінюється типовим", () => {
    for (const max of [2, 11, 4.5, -1]) {
      expect(getScaleBounds("RATING", { max })).toEqual({ min: 1, max: 5 });
    }
  });

  it("SCALE: початок 0 або 1, кінець 2..10 і строго більший за початок", () => {
    expect(getScaleBounds("SCALE", null)).toEqual({ min: 1, max: 5 });
    expect(getScaleBounds("SCALE", { min: 0, max: 10 })).toEqual({ min: 0, max: 10 });
    expect(getScaleBounds("SCALE", { min: 1, max: 2 })).toEqual({ min: 1, max: 2 });
  });

  it("SCALE: некоректний початок/кінець падають на типові межі", () => {
    expect(getScaleBounds("SCALE", { min: 3, max: 8 })).toEqual({ min: 1, max: 8 });
    expect(getScaleBounds("SCALE", { min: 1, max: 1 })).toEqual({ min: 1, max: 5 });
    expect(getScaleBounds("SCALE", { min: 1, max: 99 })).toEqual({ min: 1, max: 5 });
  });
});

describe("isScaleQuestionType", () => {
  it("розпізнає лише шкальні типи", () => {
    expect(["RATING", "SCALE", "NPS"].every((t) => isScaleQuestionType(t as never))).toBe(true);
    expect(["TEXT", "NUMBER", "CHOICE_SINGLE", "BOOLEAN", "DATE"].some((t) =>
      isScaleQuestionType(t as never),
    )).toBe(false);
  });
});

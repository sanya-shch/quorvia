import { describe, expect, it } from "vitest";
import type { Question } from "../../types/formBuilder";
import { countMissingRequired, getAnswerProgress, isAnswered } from "./answerProgress";

const q = (overrides: Partial<Question>): Question => ({
  id: "q",
  type: "TEXT",
  text: "",
  required: false,
  order: 0,
  options: [],
  config: null,
  ...overrides,
});

describe("isAnswered", () => {
  const text = q({});

  it("treats an empty or blank value as not answered", () => {
    expect(isAnswered(text, undefined)).toBe(false);
    expect(isAnswered(text, "")).toBe(false);
    expect(isAnswered(text, "   ")).toBe(false);
    expect(isAnswered(q({ type: "CHOICE_MULTI" }), [])).toBe(false);
    expect(isAnswered(q({ type: "MATRIX" }), {})).toBe(false);
  });

  it("counts numbers (including 0), switches, lists and matrix cells as answered", () => {
    expect(isAnswered(text, "hi")).toBe(true);
    expect(isAnswered(q({ type: "NUMBER" }), 0)).toBe(true);
    expect(isAnswered(q({ type: "BOOLEAN" }), false)).toBe(true);
    expect(isAnswered(q({ type: "CHOICE_MULTI" }), ["a"])).toBe(true);
    expect(isAnswered(q({ type: "MATRIX" }), { row: "col" })).toBe(true);
  });

  it("never reports a calculation as missing", () => {
    expect(isAnswered(q({ type: "CALCULATION" }), "")).toBe(true);
  });
});

describe("getAnswerProgress", () => {
  it("counts answered questions and leaves calculations out of the total", () => {
    const questions = [
      q({ id: "a" }),
      q({ id: "b" }),
      q({ id: "c", type: "NUMBER" }),
      q({ id: "calc", type: "CALCULATION" }),
    ];

    expect(getAnswerProgress(questions, { a: "x", b: "", c: 0 })).toEqual({
      answered: 2,
      total: 3,
      percent: 67,
    });
  });

  it("is 0% for a form without questions", () => {
    expect(getAnswerProgress([], {})).toEqual({ answered: 0, total: 0, percent: 0 });
  });
});

describe("countMissingRequired", () => {
  it("counts only 'required' errors, not format errors", () => {
    expect(
      countMissingRequired({
        a: { key: "errors.VALIDATION_FIELD_REQUIRED" },
        b: { key: "errors.VALIDATION_EMAIL_INVALID" },
      }),
    ).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { saveAttemptSchema } from "./attempt.schema.js";

describe("saveAttemptSchema", () => {
  it("валідний payload з sessionKey і answers проходить", () => {
    const result = saveAttemptSchema.safeParse({
      sessionKey: "session-abc-123",
      answers: { "q-1": "текст", "q-2": 42, "q-3": true, "q-4": ["a", "b"] },
    });
    expect(result.success).toBe(true);
  });

  it("порожні answers валідні (початковий autosave до будь-якого вводу)", () => {
    const result = saveAttemptSchema.safeParse({ sessionKey: "session-1", answers: {} });
    expect(result.success).toBe(true);
  });

  it("відхиляє порожній sessionKey", () => {
    const result = saveAttemptSchema.safeParse({ sessionKey: "", answers: {} });
    expect(result.success).toBe(false);
  });

  it("відхиляє відсутній sessionKey", () => {
    const result = saveAttemptSchema.safeParse({ answers: {} });
    expect(result.success).toBe(false);
  });

  it("відхиляє sessionKey довше 100 символів", () => {
    const result = saveAttemptSchema.safeParse({ sessionKey: "x".repeat(101), answers: {} });
    expect(result.success).toBe(false);
  });

  it("приймає відповідь матриці: об'єкт { рядок: колонка }", () => {
    const result = saveAttemptSchema.safeParse({
      sessionKey: "session-1",
      answers: { "q-1": { "row-1": "col-a", "row-2": "col-b" } },
    });
    expect(result.success).toBe(true);
  });

  it("відхиляє інші об'єкти: вкладені, не рядкові значення, надто багато рядків", () => {
    const parse = (value: unknown) =>
      saveAttemptSchema.safeParse({ sessionKey: "session-1", answers: { "q-1": value } }).success;

    expect(parse({ nested: { deep: "object" } })).toBe(false);
    expect(parse({ row: 5 })).toBe(false);
    expect(parse({ row: ["a"] })).toBe(false);
    expect(
      parse(Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`row-${i}`, "c"]))),
    ).toBe(false);
    expect(parse({ ["k".repeat(101)]: "c" })).toBe(false);
  });

  describe("reachedQuestionIds", () => {
    it("необов'язкове поле (старі клієнти та режим ALL_AT_ONCE його не шлють)", () => {
      expect(saveAttemptSchema.safeParse({ sessionKey: "s", answers: {} }).success).toBe(true);
    });

    it("приймає масив id", () => {
      const result = saveAttemptSchema.safeParse({
        sessionKey: "s",
        answers: {},
        reachedQuestionIds: ["q-1", "q-2"],
      });
      expect(result.success).toBe(true);
    });

    it("відхиляє більше 200 id (стеля, як і для питань у формі)", () => {
      const result = saveAttemptSchema.safeParse({
        sessionKey: "s",
        answers: {},
        reachedQuestionIds: Array.from({ length: 201 }, (_, i) => `q-${i}`),
      });
      expect(result.success).toBe(false);
    });

    it("відхиляє id довше 100 символів і не-рядки", () => {
      expect(
        saveAttemptSchema.safeParse({ sessionKey: "s", answers: {}, reachedQuestionIds: ["x".repeat(101)] })
          .success,
      ).toBe(false);
      expect(
        saveAttemptSchema.safeParse({ sessionKey: "s", answers: {}, reachedQuestionIds: [1] }).success,
      ).toBe(false);
    });
  });
});

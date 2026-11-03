import { describe, expect, it } from "vitest";
import { otherAnswerKey } from "@quorvia/shared-types";
import {
  answersSchema,
  MAX_ANSWER_KEY_LENGTH,
  MAX_ANSWER_KEYS,
  MAX_ANSWER_STRING_LENGTH,
} from "./answers.js";

describe("answersSchema", () => {
  it("приймає звичайні відповіді", () => {
    expect(answersSchema.safeParse({ a: "x", b: 1, c: true, d: ["1", "2"] }).success).toBe(true);
  });

  it("відхиляє надто довгий рядок", () => {
    const result = answersSchema.safeParse({ a: "x".repeat(MAX_ANSWER_STRING_LENGTH + 1) });
    expect(result.success).toBe(false);
  });

  it("відхиляє надто багато ключів", () => {
    const answers = Object.fromEntries(Array.from({ length: MAX_ANSWER_KEYS + 1 }, (_, i) => [`q${i}`, "x"]));
    expect(answersSchema.safeParse(answers).success).toBe(false);
  });

  it("ключ питання до 100 символів + суфікс «Інше» ще проходить", () => {
    // id питання максимум 100 символів (FORM_LIMITS.id); ключ тексту «Інше» довший на суфікс.
    expect(answersSchema.safeParse({ [otherAnswerKey("k".repeat(100))]: "x" }).success).toBe(true);
  });

  it("відхиляє надто довгий ключ і надто великий масив", () => {
    expect(answersSchema.safeParse({ ["k".repeat(MAX_ANSWER_KEY_LENGTH + 1)]: "x" }).success).toBe(
      false,
    );
    expect(answersSchema.safeParse({ a: Array.from({ length: 201 }, () => "x") }).success).toBe(false);
  });
});

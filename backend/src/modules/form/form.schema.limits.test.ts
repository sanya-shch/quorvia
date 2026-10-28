import { describe, expect, it } from "vitest";
import { createFormSchema, FORM_LIMITS, updateFormSchema } from "./form.schema.js";

const textQuestion = (config?: Record<string, unknown>) => ({
  type: "TEXT" as const,
  text: "Q",
  order: 0,
  ...(config ? { config } : {}),
});

describe("createFormSchema", () => {
  it("приймає валідні дані та обрізає пробіли в title", () => {
    expect(createFormSchema.parse({ title: "  Моя форма  " }).title).toBe("Моя форма");
  });

  it("відхиляє відсутній/закороткий/задовгий title", () => {
    expect(createFormSchema.safeParse({}).success).toBe(false);
    expect(createFormSchema.safeParse({ title: "ab" }).success).toBe(false);
    expect(createFormSchema.safeParse({ title: "x".repeat(FORM_LIMITS.title + 1) }).success).toBe(false);
  });

  it("відхиляє надто довгий description", () => {
    const description = "x".repeat(FORM_LIMITS.description + 1);

    expect(createFormSchema.safeParse({ title: "Форма", description }).success).toBe(false);
  });
});

describe("updateFormSchema: ліміти та безпечні шаблони", () => {
  const base = { title: "Форма", questions: [textQuestion()] };

  it("приймає звичайну форму", () => {
    expect(updateFormSchema.safeParse(base).success).toBe(true);
  });

  it("відхиляє забагато питань", () => {
    const questions = Array.from({ length: FORM_LIMITS.questions + 1 }, () => textQuestion());

    expect(updateFormSchema.safeParse({ ...base, questions }).success).toBe(false);
  });

  it("відхиляє забагато опцій", () => {
    const options = Array.from({ length: FORM_LIMITS.options + 1 }, (_, i) => ({ id: `o${i}`, text: "x" }));
    const questions = [{ type: "CHOICE_SINGLE" as const, text: "Q", order: 0, options }];

    expect(updateFormSchema.safeParse({ ...base, questions }).success).toBe(false);
  });

  it("відхиляє надто довгий текст питання", () => {
    const questions = [{ ...textQuestion(), text: "x".repeat(FORM_LIMITS.questionText + 1) }];

    expect(updateFormSchema.safeParse({ ...base, questions }).success).toBe(false);
  });

  it("приймає шаблон, сумісний з RE2", () => {
    const questions = [textQuestion({ pattern: "^[A-Z]{2}\\d+$" })];

    expect(updateFormSchema.safeParse({ ...base, questions }).success).toBe(true);
  });

  it.each(["(?=a)b", "(a)\\1", "(["])("відхиляє шаблон, який не можна безпечно виконати: %j", (pattern) => {
    const questions = [textQuestion({ pattern })];

    expect(updateFormSchema.safeParse({ ...base, questions }).success).toBe(false);
  });

  it("відхиляє задовгий шаблон і від'ємні/дробові minLength", () => {
    expect(updateFormSchema.safeParse({ ...base, questions: [textQuestion({ pattern: "a".repeat(201) })] }).success).toBe(false);
    expect(updateFormSchema.safeParse({ ...base, questions: [textQuestion({ minLength: -1 })] }).success).toBe(false);
    expect(updateFormSchema.safeParse({ ...base, questions: [textQuestion({ maxLength: 1.5 })] }).success).toBe(false);
  });
});

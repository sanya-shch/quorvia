import { describe, expect, it } from "vitest";
import { createFormSchema, questionSchema, updateFormSchema } from "./form.schema.js";

describe("createFormSchema", () => {
  it("вимагає title від 3 символів", () => {
    expect(createFormSchema.safeParse({ title: "ab" }).success).toBe(false);
    expect(createFormSchema.safeParse({ title: "abc" }).success).toBe(true);
  });

  it("description необов'язковий", () => {
    expect(createFormSchema.safeParse({ title: "Форма" }).success).toBe(true);
  });
});

describe("questionSchema — discriminated union за type", () => {
  const base = { text: "Питання", order: 0 };

  it("TEXT валідний без options", () => {
    const result = questionSchema.safeParse({ ...base, type: "TEXT" });
    expect(result.success).toBe(true);
  });

  it("CHOICE_SINGLE вимагає хоча б одну опцію", () => {
    expect(questionSchema.safeParse({ ...base, type: "CHOICE_SINGLE", options: [] }).success).toBe(
      false,
    );

    expect(
      questionSchema.safeParse({
        ...base,
        type: "CHOICE_SINGLE",
        options: [{ id: "opt-1", text: "Варіант" }],
      }).success,
    ).toBe(true);
  });

  it("CHOICE_MULTI так само вимагає options", () => {
    expect(questionSchema.safeParse({ ...base, type: "CHOICE_MULTI", options: [] }).success).toBe(
      false,
    );
  });

  it("CHOICE_SINGLE без поля options взагалі — невалідний (поле обов'язкове для цього варіанту)", () => {
    const result = questionSchema.safeParse({ ...base, type: "CHOICE_SINGLE" });
    expect(result.success).toBe(false);
  });

  it("BOOLEAN/DATE/NUMBER валідні без options", () => {
    expect(questionSchema.safeParse({ ...base, type: "BOOLEAN" }).success).toBe(true);
    expect(questionSchema.safeParse({ ...base, type: "DATE" }).success).toBe(true);
    expect(questionSchema.safeParse({ ...base, type: "NUMBER" }).success).toBe(true);
  });

  it("невідомий type відхиляється дискримінатором", () => {
    const result = questionSchema.safeParse({ ...base, type: "UNKNOWN" });
    expect(result.success).toBe(false);
  });

  it("NUMBER з config.min/max валідний, з невалідним типом config — ні", () => {
    expect(
      questionSchema.safeParse({
        ...base,
        type: "NUMBER",
        config: { min: 0, max: 100 },
      }).success,
    ).toBe(true);

    expect(
      questionSchema.safeParse({
        ...base,
        type: "NUMBER",
        config: { min: "нуль" },
      }).success,
    ).toBe(false);
  });

  it("RATING: config.max лише ціле 3..10; без config валідний", () => {
    const rating = (config?: unknown) =>
      questionSchema.safeParse({ ...base, type: "RATING", config }).success;

    expect(rating()).toBe(true);
    expect(rating(null)).toBe(true);
    expect(rating({ max: 3 })).toBe(true);
    expect(rating({ max: 10 })).toBe(true);
    expect(rating({ max: 2 })).toBe(false);
    expect(rating({ max: 11 })).toBe(false);
    expect(rating({ max: 4.5 })).toBe(false);
  });

  it("SCALE: початок 0|1, кінець 2..10 і більший за початок, підписи до 100 символів", () => {
    const scale = (config?: unknown) =>
      questionSchema.safeParse({ ...base, type: "SCALE", config }).success;

    expect(scale()).toBe(true);
    expect(scale({ min: 0, max: 10, minLabel: "Ні", maxLabel: "Так" })).toBe(true);
    expect(scale({ min: 2, max: 5 })).toBe(false);
    expect(scale({ min: 1, max: 1 })).toBe(false);
    expect(scale({ min: 1, max: 11 })).toBe(false);
    expect(scale({ minLabel: "x".repeat(101) })).toBe(false);
    // типовий кінець 5 має бути більшим за заданий початок
    expect(scale({ min: 1 })).toBe(true);
  });

  it("NPS не потребує config", () => {
    expect(questionSchema.safeParse({ ...base, type: "NPS" }).success).toBe(true);
  });

  it("NUMBER зі слайдером вимагає min < max; крок додатний", () => {
    const number = (config: unknown) =>
      questionSchema.safeParse({ ...base, type: "NUMBER", config }).success;

    expect(number({ numberVariant: "slider", min: 0, max: 10, step: 2 })).toBe(true);
    expect(number({ numberVariant: "slider", min: 0 })).toBe(false);
    expect(number({ numberVariant: "slider", min: 5, max: 5 })).toBe(false);
    expect(number({ numberVariant: "slider", min: 0, max: 10, step: 0 })).toBe(false);
    expect(number({ numberVariant: "input" })).toBe(true);
  });

  describe("варіант «Інше»", () => {
    const choice = (options: unknown[], extra: Record<string, unknown> = {}) =>
      questionSchema.safeParse({ ...base, type: "CHOICE_SINGLE", options, ...extra }).success;

    const a = { id: "a", text: "A" };
    const b = { id: "b", text: "B" };
    const other = { id: "o", text: "Інше", isOther: true };

    it("допускає один «Інше» в кінці списку", () => {
      expect(choice([a, b, other])).toBe(true);
      expect(choice([other])).toBe(true);
      expect(choice([a, b])).toBe(true);
    });

    it("відхиляє «Інше» не в кінці, дві штуки або як варіант за замовчуванням", () => {
      expect(choice([other, a])).toBe(false);
      expect(choice([a, other, { ...other, id: "o2" }])).toBe(false);
      expect(choice([a, { ...other, isDefault: true }])).toBe(false);
    });

    it("діє і для CHOICE_MULTI", () => {
      const multi = (options: unknown[]) =>
        questionSchema.safeParse({ ...base, type: "CHOICE_MULTI", options }).success;

      expect(multi([a, other])).toBe(true);
      expect(multi([other, a])).toBe(false);
    });

    it("id питання не може закінчуватись на зарезервований суфікс", () => {
      expect(choice([a], { id: "question__other" })).toBe(false);
      expect(choice([a], { id: "question" })).toBe(true);
    });
  });

  describe("RANKING", () => {
    const ranking = (options: unknown[]) =>
      questionSchema.safeParse({ ...base, type: "RANKING", options }).success;
    const opt = (id: string) => ({ id, text: id.toUpperCase() });

    it("від 2 до 20 варіантів", () => {
      expect(ranking([opt("a"), opt("b")])).toBe(true);
      expect(ranking([opt("a")])).toBe(false);
      expect(ranking([])).toBe(false);
      expect(ranking(Array.from({ length: 20 }, (_, i) => opt(`o${i}`)))).toBe(true);
      expect(ranking(Array.from({ length: 21 }, (_, i) => opt(`o${i}`)))).toBe(false);
    });

    it("id варіантів мають бути унікальними (відповідь - перестановка id)", () => {
      expect(ranking([opt("a"), opt("a")])).toBe(false);
    });

    it("«Інше» для ранжування відкидається схемою (немає в результаті parse)", () => {
      const result = questionSchema.safeParse({
        ...base,
        type: "RANKING",
        options: [opt("a"), { ...opt("b"), isOther: true }],
      });

      expect(result.success).toBe(true);
      if (result.success && result.data.type === "RANKING") {
        expect(result.data.options.some((o) => "isOther" in o)).toBe(false);
      }
    });
  });

  describe("MATRIX", () => {
    const col = (id: string) => ({ id, text: id.toUpperCase() });
    const row = (id: string) => ({ id, text: `Рядок ${id}` });
    const matrix = (options: unknown[], config: unknown) =>
      questionSchema.safeParse({ ...base, type: "MATRIX", options, config }).success;

    const columns = [col("a"), col("b")];

    it("валідна: 2-10 колонок і 1-30 рядків", () => {
      expect(matrix(columns, { rows: [row("r1")] })).toBe(true);
      expect(matrix(Array.from({ length: 10 }, (_, i) => col(`c${i}`)), { rows: [row("r1")] })).toBe(
        true,
      );
      expect(matrix(columns, { rows: Array.from({ length: 30 }, (_, i) => row(`r${i}`)) })).toBe(
        true,
      );
    });

    it("відхиляє замало/забагато колонок і рядків", () => {
      expect(matrix([col("a")], { rows: [row("r1")] })).toBe(false);
      expect(matrix(Array.from({ length: 11 }, (_, i) => col(`c${i}`)), { rows: [row("r1")] })).toBe(
        false,
      );
      expect(matrix(columns, { rows: [] })).toBe(false);
      expect(matrix(columns, { rows: Array.from({ length: 31 }, (_, i) => row(`r${i}`)) })).toBe(
        false,
      );
    });

    it("config з рядками обов'язковий", () => {
      expect(matrix(columns, undefined)).toBe(false);
      expect(matrix(columns, null)).toBe(false);
      expect(matrix(columns, {})).toBe(false);
    });

    it("id рядків і колонок унікальні в межах свого списку; текст рядка не порожній", () => {
      expect(matrix(columns, { rows: [row("r1"), row("r1")] })).toBe(false);
      expect(matrix([col("a"), col("a")], { rows: [row("r1")] })).toBe(false);
      expect(matrix(columns, { rows: [{ id: "r1", text: "   " }] })).toBe(false);
    });
  });

  it("text обов'язковий і не може бути порожнім", () => {
    const result = questionSchema.safeParse({ type: "TEXT", text: "", order: 0 });
    expect(result.success).toBe(false);
  });

  it("condition необов'язковий, question валідний без нього", () => {
    expect(questionSchema.safeParse({ ...base, type: "TEXT" }).success).toBe(true);
  });

  it("condition приймає null (явне 'без умови' при оновленні)", () => {
    expect(questionSchema.safeParse({ ...base, type: "TEXT", condition: null }).success).toBe(true);
  });

  it("валідний condition з AND/OR і одним із операторів", () => {
    const result = questionSchema.safeParse({
      ...base,
      type: "TEXT",
      condition: {
        logic: "AND",
        rules: [{ questionId: "q1", operator: "equals", value: "yes" }],
      },
    });
    expect(result.success).toBe(true);
  });

  it("condition з порожнім rules — невалідний", () => {
    const result = questionSchema.safeParse({
      ...base,
      type: "TEXT",
      condition: { logic: "AND", rules: [] },
    });
    expect(result.success).toBe(false);
  });

  it("condition з невідомим оператором — невалідний", () => {
    const result = questionSchema.safeParse({
      ...base,
      type: "TEXT",
      condition: {
        logic: "AND",
        rules: [{ questionId: "q1", operator: "startsWith", value: "y" }],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("updateFormSchema", () => {
  it("приймає форму з масивом валідних питань", () => {
    const result = updateFormSchema.safeParse({
      title: "Моя форма",
      questions: [{ type: "TEXT", text: "Ім'я", order: 0 }],
    });

    expect(result.success).toBe(true);
  });

  it("відхиляє, якщо хоч одне питання невалідне", () => {
    const result = updateFormSchema.safeParse({
      title: "Моя форма",
      questions: [
        { type: "TEXT", text: "Ім'я", order: 0 },
        { type: "CHOICE_SINGLE", text: "Колір", order: 1, options: [] },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("порожній масив questions валідний (форма без питань)", () => {
    const result = updateFormSchema.safeParse({ title: "Порожня форма", questions: [] });

    expect(result.success).toBe(true);
  });

  it("responseMode необов'язковий - без нього форма все ще валідна", () => {
    const result = updateFormSchema.safeParse({ title: "Форма", questions: [] });
    expect(result.success).toBe(true);
  });

  it("приймає обидва значення responseMode", () => {
    expect(
      updateFormSchema.safeParse({ title: "Форма", responseMode: "ALL_AT_ONCE", questions: [] })
        .success,
    ).toBe(true);
    expect(
      updateFormSchema.safeParse({ title: "Форма", responseMode: "STEP_BY_STEP", questions: [] })
        .success,
    ).toBe(true);
  });

  it("відхиляє невідоме значення responseMode", () => {
    const result = updateFormSchema.safeParse({
      title: "Форма",
      responseMode: "RANDOM_MODE",
      questions: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("мови контенту у схемах форми", () => {
  const form = (extra: Record<string, unknown>) =>
    updateFormSchema.safeParse({ title: "Форма", questions: [], ...extra }).success;

  it("createFormSchema: defaultLanguage - код зі списку, необов'язковий", () => {
    expect(createFormSchema.safeParse({ title: "Форма", defaultLanguage: "en" }).success).toBe(true);
    expect(createFormSchema.safeParse({ title: "Форма", defaultLanguage: "xx" }).success).toBe(false);
    expect(createFormSchema.safeParse({ title: "Форма", defaultLanguage: "en-US" }).success).toBe(false);
  });

  it("languages: коди зі списку, без дублікатів, не більше 10", () => {
    expect(form({ languages: ["en", "pl"] })).toBe(true);
    expect(form({ languages: [] })).toBe(true);
    expect(form({ languages: ["en", "en"] })).toBe(false);
    expect(form({ languages: ["xx"] })).toBe(false);
    expect(form({ languages: ["en", "pl", "de", "fr", "es", "it", "pt", "nl", "cs", "sk", "ro"] })).toBe(
      false,
    );
  });

  it("усі три поля мов необов'язкові (сумісність зі старим клієнтом)", () => {
    expect(form({})).toBe(true);
    expect(form({ defaultLanguage: "en" })).toBe(true);
  });

  it("translations форми: рядки обмеженої довжини; null дозволено", () => {
    expect(form({ translations: { en: { title: "Survey", description: "d" } } })).toBe(true);
    expect(form({ translations: null })).toBe(true);
    expect(form({ translations: { en: { title: "x".repeat(201) } } })).toBe(false);
    expect(form({ translations: { en: { title: 5 } } })).toBe(false);
  });

  it("translations питання: текст, варіанти, рядки, підписи", () => {
    const question = (translations: unknown) =>
      questionSchema.safeParse({ text: "Q", order: 0, type: "TEXT", translations }).success;

    expect(
      question({
        en: { text: "Q", description: "d", options: { a: "A" }, rows: { r1: "R" }, minLabel: "x", maxLabel: "y" },
      }),
    ).toBe(true);
    expect(question(null)).toBe(true);
    expect(question({ en: { text: "x".repeat(501) } })).toBe(false);
    expect(question({ en: { minLabel: "x".repeat(101) } })).toBe(false);
    expect(question({ en: { options: { a: 5 } } })).toBe(false);
  });

  it("не приймає надто багато мов у translations", () => {
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`l${i}`, { text: "x" }]));

    expect(
      questionSchema.safeParse({ text: "Q", order: 0, type: "TEXT", translations: many }).success,
    ).toBe(false);
  });
});

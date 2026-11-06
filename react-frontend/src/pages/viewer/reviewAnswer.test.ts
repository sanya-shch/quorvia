import { describe, expect, it } from "vitest";
import { formatReviewAnswer } from "./reviewAnswer";
import type { Question } from "../../types/formBuilder";

const labels = { yes: "Так", no: "Ні", empty: "Без відповіді" };

const q = (overrides: Partial<Question>): Question => ({
  id: "q",
  type: "TEXT",
  text: "Питання",
  required: false,
  order: 0,
  options: [],
  config: null,
  ...overrides,
});

const options = [
  { id: "a", text: "Кава", isDefault: false },
  { id: "b", text: "Чай", isDefault: false },
  { id: "o", text: "Інше", isDefault: false, isOther: true },
];

describe("formatReviewAnswer", () => {
  it("простий текст, число, дата, шкали - як є; порожнє - підпис «без відповіді»", () => {
    for (const type of ["TEXT", "NUMBER", "DATE", "RATING", "SCALE", "NPS"] as const) {
      expect(formatReviewAnswer(q({ type }), type === "TEXT" ? "привіт" : 7, undefined, labels)).toBe(
        type === "TEXT" ? "привіт" : "7",
      );
      expect(formatReviewAnswer(q({ type }), "", undefined, labels)).toBe("Без відповіді");
    }
    // 0 is a real answer (NPS, a scale from zero), not an empty value
    expect(formatReviewAnswer(q({ type: "NPS" }), 0, undefined, labels)).toBe("0");
  });

  it("BOOLEAN: Так/Ні замість true/false", () => {
    expect(formatReviewAnswer(q({ type: "BOOLEAN" }), true, undefined, labels)).toBe("Так");
    expect(formatReviewAnswer(q({ type: "BOOLEAN" }), false, undefined, labels)).toBe("Ні");
  });

  it("вибір: тексти варіантів, а не id; «Інше» з текстом респондента", () => {
    const single = q({ type: "CHOICE_SINGLE", options });
    const multi = q({ type: "CHOICE_MULTI", options });

    expect(formatReviewAnswer(single, "b", undefined, labels)).toBe("Чай");
    expect(formatReviewAnswer(single, "o", " Какао ", labels)).toBe("Інше: Какао");
    expect(formatReviewAnswer(multi, ["a", "o"], "Матча", labels)).toBe("Кава, Інше: Матча");
    expect(formatReviewAnswer(multi, [], undefined, labels)).toBe("Без відповіді");
  });

  it("RANKING: нумерований список у порядку відповіді", () => {
    expect(
      formatReviewAnswer(q({ type: "RANKING", options }), ["b", "a", "o"], undefined, labels),
    ).toBe("1. Чай; 2. Кава; 3. Інше");
  });

  it("MATRIX: «Рядок: Колонка» у порядку рядків; без відповідей - підпис", () => {
    const matrix = q({
      type: "MATRIX",
      options,
      config: {
        rows: [
          { id: "r1", text: "Швидкість" },
          { id: "r2", text: "Ціна" },
        ],
      },
    });

    expect(formatReviewAnswer(matrix, { r2: "b", r1: "a" }, undefined, labels)).toBe(
      "Швидкість: Кава; Ціна: Чай",
    );
    expect(formatReviewAnswer(matrix, { r2: "b" }, undefined, labels)).toBe("Ціна: Чай");
    expect(formatReviewAnswer(matrix, "", undefined, labels)).toBe("Без відповіді");
  });
});

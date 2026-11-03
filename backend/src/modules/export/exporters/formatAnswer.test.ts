import { describe, expect, it } from "vitest";
import { Question } from "@prisma/client";
import { formatAnswer, slugifyFileName } from "./formatAnswer.js";

const baseQuestion: Omit<Question, "id" | "type" | "options"> = {
  text: "Питання",
  description: null,
  required: false,
  config: null,
  formId: "form-1",
  condition: null,
  order: 0,
};

const makeQuestion = (overrides: Partial<Question>): Question => ({
  ...baseQuestion,
  id: "q-1",
  type: "TEXT",
  options: null,
  ...overrides,
});

describe("formatAnswer - варіант «Інше»", () => {
  const options = [
    { id: "a", text: "A", isDefault: false },
    { id: "o", text: "Інше", isDefault: false, isOther: true },
  ];

  it("CHOICE_SINGLE: «Інше: текст респондента»", () => {
    const question = makeQuestion({ type: "CHOICE_SINGLE", options });

    expect(formatAnswer(question, "o", "свій варіант")).toBe("Інше: свій варіант");
    expect(formatAnswer(question, "a", "залишок")).toBe("A");
  });

  it("CHOICE_MULTI: текст додається лише до «Інше»", () => {
    const question = makeQuestion({ type: "CHOICE_MULTI", options });

    expect(formatAnswer(question, ["a", "o"], "x")).toBe("A; Інше: x");
  });

  it("без тексту лишається підпис варіанта", () => {
    const question = makeQuestion({ type: "CHOICE_SINGLE", options });

    expect(formatAnswer(question, "o")).toBe("Інше");
    expect(formatAnswer(question, "o", "")).toBe("Інше");
  });
});

describe("formatAnswer - RANKING", () => {
  const options = [
    { id: "a", text: "Кава", isDefault: false },
    { id: "b", text: "Чай", isDefault: false },
    { id: "c", text: "Какао", isDefault: false },
  ];

  it("нумерує варіанти в порядку ранжування", () => {
    const question = makeQuestion({ type: "RANKING", options });

    expect(formatAnswer(question, ["b", "c", "a"])).toBe("1. Чай; 2. Какао; 3. Кава");
  });

  it("невідомий id (варіант видалили) лишається як є, а не ламає експорт", () => {
    const question = makeQuestion({ type: "RANKING", options });

    expect(formatAnswer(question, ["b", "gone"])).toBe("1. Чай; 2. gone");
  });
});

describe("formatAnswer", () => {
  it("повертає порожній рядок для null/undefined/порожнього значення", () => {
    const question = makeQuestion({ type: "TEXT" });

    expect(formatAnswer(question, null)).toBe("");
    expect(formatAnswer(question, undefined)).toBe("");
    expect(formatAnswer(question, "")).toBe("");
  });

  it("форматує BOOLEAN як Так/Ні", () => {
    const question = makeQuestion({ type: "BOOLEAN" });

    expect(formatAnswer(question, true)).toBe("Так");
    expect(formatAnswer(question, false)).toBe("Ні");
  });

  it("CHOICE_SINGLE перетворює id опції на її текст", () => {
    const question = makeQuestion({
      type: "CHOICE_SINGLE",
      options: [
        { id: "opt-a", text: "Варіант А" },
        { id: "opt-b", text: "Варіант Б" },
      ],
    });

    expect(formatAnswer(question, "opt-b")).toBe("Варіант Б");
  });

  it("CHOICE_SINGLE лишає id як є, якщо опцію не знайдено (застаріла відповідь)", () => {
    const question = makeQuestion({
      type: "CHOICE_SINGLE",
      options: [{ id: "opt-a", text: "Варіант А" }],
    });

    expect(formatAnswer(question, "opt-deleted")).toBe("opt-deleted");
  });

  it('CHOICE_MULTI повертає обрані опції через "; "', () => {
    const question = makeQuestion({
      type: "CHOICE_MULTI",
      options: [
        { id: "opt-a", text: "Раз" },
        { id: "opt-b", text: "Два" },
        { id: "opt-c", text: "Три" },
      ],
    });

    expect(formatAnswer(question, ["opt-c", "opt-a"])).toBe("Три; Раз");
  });

  it("CHOICE_MULTI з порожнім масивом дає порожній рядок", () => {
    const question = makeQuestion({ type: "CHOICE_MULTI", options: [] });

    expect(formatAnswer(question, [])).toBe("");
  });

  it("CHOICE_SINGLE з options=null не падає, а лишає id відповіді як є", () => {
    const question = makeQuestion({ type: "CHOICE_SINGLE", options: null });

    expect(formatAnswer(question, "opt-a")).toBe("opt-a");
  });

  it("DATE форматує валідну ISO-дату у локальний формат", () => {
    const question = makeQuestion({ type: "DATE" });

    expect(formatAnswer(question, "1996-03-02")).toBe(
      new Date("1996-03-02").toLocaleDateString("uk-UA"),
    );
  });

  it("DATE лишає значення без змін, якщо дата невалідна", () => {
    const question = makeQuestion({ type: "DATE" });

    expect(formatAnswer(question, "не-дата")).toBe("не-дата");
  });

  it("NUMBER і TEXT повертають значення через String()", () => {
    const numberQuestion = makeQuestion({ type: "NUMBER" });
    const textQuestion = makeQuestion({ type: "TEXT" });

    expect(formatAnswer(numberQuestion, 42)).toBe("42");
    expect(formatAnswer(textQuestion, "привіт")).toBe("привіт");
  });

  it('довільний масив (не CHOICE_*) з\'єднує елементи через "; "', () => {
    const question = makeQuestion({ type: "TEXT" });

    expect(formatAnswer(question, ["a", "b"])).toBe("a; b");
  });
});

describe("slugifyFileName", () => {
  it("транслітерує кирилицю в латиницю", () => {
    expect(slugifyFileName("Форма зворотного зв'язку")).toBe("forma-zvorotnoho-zviazku");
  });

  it("прибирає спецсимволи та зайві дефіси", () => {
    expect(slugifyFileName("Опитування №1 (тест)!!!")).toBe("opytuvannia-no1-test");
  });

  it('повертає "form" для порожнього/повністю непридатного рядка', () => {
    expect(slugifyFileName("")).toBe("form");
    expect(slugifyFileName("!!!")).toBe("form");
  });

  it("не чіпає вже латинський заголовок", () => {
    expect(slugifyFileName("Customer Feedback Survey")).toBe("customer-feedback-survey");
  });
});

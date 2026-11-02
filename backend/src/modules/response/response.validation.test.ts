import { describe, expect, it } from "vitest";
import { Question } from "../../shared/types/questions.js";
import { buildResponseSchema } from "./response.validation.js";

const makeQuestion = (overrides: Partial<Question>): Question => ({
  id: "q-1",
  type: "TEXT",
  text: "Питання",
  required: true,
  order: 0,
  options: [],
  config: null,
  ...overrides,
});

describe("buildResponseSchema — TEXT", () => {
  it("вимагає непорожній рядок, коли required", () => {
    const schema = buildResponseSchema([makeQuestion({ type: "TEXT", required: true })]);

    expect(schema.safeParse({ "q-1": "" }).success).toBe(false);
    expect(schema.safeParse({ "q-1": "ok" }).success).toBe(true);
  });

  it("необов'язкове поле можна не передавати", () => {
    const schema = buildResponseSchema([makeQuestion({ type: "TEXT", required: false })]);

    expect(schema.safeParse({}).success).toBe(true);
  });

  it('config.variant "email" вмикає валідацію email', () => {
    const schema = buildResponseSchema([
      makeQuestion({ type: "TEXT", config: { variant: "email" } }),
    ]);

    expect(schema.safeParse({ "q-1": "not-an-email" }).success).toBe(false);
    expect(schema.safeParse({ "q-1": "a@b.com" }).success).toBe(true);
  });

  it("minLength/maxLength обмежують довжину", () => {
    const schema = buildResponseSchema([
      makeQuestion({ type: "TEXT", config: { minLength: 3, maxLength: 5 } }),
    ]);

    expect(schema.safeParse({ "q-1": "ab" }).success).toBe(false);
    expect(schema.safeParse({ "q-1": "abc" }).success).toBe(true);
    expect(schema.safeParse({ "q-1": "abcdef" }).success).toBe(false);
  });

  it("pattern застосовує regex-валідацію", () => {
    const schema = buildResponseSchema([
      makeQuestion({ type: "TEXT", config: { pattern: "^\\d{5}$" } }),
    ]);

    expect(schema.safeParse({ "q-1": "12345" }).success).toBe(true);
    expect(schema.safeParse({ "q-1": "abcde" }).success).toBe(false);
  });
});

describe("buildResponseSchema — NUMBER", () => {
  it("приймає лише числа, з опційним min/max", () => {
    const schema = buildResponseSchema([
      makeQuestion({ type: "NUMBER", config: { min: 1, max: 10 } }),
    ]);

    expect(schema.safeParse({ "q-1": 0 }).success).toBe(false);
    expect(schema.safeParse({ "q-1": 5 }).success).toBe(true);
    expect(schema.safeParse({ "q-1": 11 }).success).toBe(false);
    expect(schema.safeParse({ "q-1": "п'ять" }).success).toBe(false);
  });

  it("max можна задати без min (перевіряються незалежно)", () => {
    const schema = buildResponseSchema([makeQuestion({ type: "NUMBER", config: { max: 100 } })]);

    expect(schema.safeParse({ "q-1": 50 }).success).toBe(true);
    expect(schema.safeParse({ "q-1": 101 }).success).toBe(false);
  });
});

describe("buildResponseSchema — BOOLEAN", () => {
  it("required BOOLEAN приймає лише true (напр. згода з умовами)", () => {
    const schema = buildResponseSchema([makeQuestion({ type: "BOOLEAN", required: true })]);

    expect(schema.safeParse({ "q-1": true }).success).toBe(true);
    expect(schema.safeParse({ "q-1": false }).success).toBe(false);
  });

  it("НЕ-required BOOLEAN приймає і true, і false (і не стає optional — на відміну від інших типів)", () => {
    const schema = buildResponseSchema([makeQuestion({ type: "BOOLEAN", required: false })]);

    expect(schema.safeParse({ "q-1": true }).success).toBe(true);
    expect(schema.safeParse({ "q-1": false }).success).toBe(true);
  });
});

describe("buildResponseSchema — DATE", () => {
  it("приймає валідну дату-рядок і відхиляє невалідну", () => {
    const schema = buildResponseSchema([makeQuestion({ type: "DATE", required: true })]);

    expect(schema.safeParse({ "q-1": "2026-01-15" }).success).toBe(true);
    expect(schema.safeParse({ "q-1": "не дата" }).success).toBe(false);
  });
});

describe("buildResponseSchema — CHOICE_SINGLE", () => {
  const options = [
    { id: "opt-a", text: "А", isDefault: false },
    { id: "opt-b", text: "Б", isDefault: false },
  ];

  it("приймає лише id з переліку options", () => {
    const schema = buildResponseSchema([
      makeQuestion({ type: "CHOICE_SINGLE", options, required: true }),
    ]);

    expect(schema.safeParse({ "q-1": "opt-a" }).success).toBe(true);
    expect(schema.safeParse({ "q-1": "opt-nonexistent" }).success).toBe(false);
  });
});

describe("buildResponseSchema — CHOICE_MULTI", () => {
  const options = [
    { id: "opt-a", text: "А", isDefault: false },
    { id: "opt-b", text: "Б", isDefault: false },
  ];

  it("приймає масив валідних id", () => {
    const schema = buildResponseSchema([
      makeQuestion({ type: "CHOICE_MULTI", options, required: false }),
    ]);

    expect(schema.safeParse({ "q-1": ["opt-a", "opt-b"] }).success).toBe(true);
    expect(schema.safeParse({ "q-1": ["opt-x"] }).success).toBe(false);
  });

  it("required CHOICE_MULTI вимагає хоча б один вибір", () => {
    const schema = buildResponseSchema([
      makeQuestion({ type: "CHOICE_MULTI", options, required: true }),
    ]);

    expect(schema.safeParse({ "q-1": [] }).success).toBe(false);
    expect(schema.safeParse({ "q-1": ["opt-a"] }).success).toBe(true);
  });
});

describe("buildResponseSchema — visibleQuestionIds (умовна логіка)", () => {
  it("без visibleQuestionIds required-питання лишається обов'язковим (стара поведінка)", () => {
    const schema = buildResponseSchema([makeQuestion({ type: "TEXT", required: true })]);

    expect(schema.safeParse({}).success).toBe(false);
  });

  it("питання поза visibleQuestionIds стає необов'язковим, навіть якщо required: true", () => {
    const schema = buildResponseSchema(
      [makeQuestion({ id: "q-1", type: "TEXT", required: true })],
      new Set<string>(), // жодне питання не видиме
    );

    expect(schema.safeParse({}).success).toBe(true);
  });

  it("питання в visibleQuestionIds лишається обов'язковим, як і раніше", () => {
    const schema = buildResponseSchema(
      [makeQuestion({ id: "q-1", type: "TEXT", required: true })],
      new Set(["q-1"]),
    );

    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ "q-1": "ok" }).success).toBe(true);
  });

  it("приховане required BOOLEAN теж стає необов'язковим (єдиний тип без .optional() за замовчуванням)", () => {
    const schema = buildResponseSchema(
      [makeQuestion({ id: "q-1", type: "BOOLEAN", required: true })],
      new Set<string>(),
    );

    expect(schema.safeParse({}).success).toBe(true);
  });
});

describe("buildResponseSchema — RATING / SCALE / NPS", () => {
  const build = (q: Partial<Question>) => buildResponseSchema([makeQuestion(q)]);

  it("RATING: ціле від 1 до config.max (типово 5)", () => {
    const schema = build({ type: "RATING" });

    expect(schema.safeParse({ "q-1": 1 }).success).toBe(true);
    expect(schema.safeParse({ "q-1": 5 }).success).toBe(true);
    expect(schema.safeParse({ "q-1": 0 }).success).toBe(false);
    expect(schema.safeParse({ "q-1": 6 }).success).toBe(false);
    expect(schema.safeParse({ "q-1": 3.5 }).success).toBe(false);
    expect(schema.safeParse({ "q-1": "3" }).success).toBe(false);

    const ten = build({ type: "RATING", config: { max: 10 } });
    expect(ten.safeParse({ "q-1": 10 }).success).toBe(true);
    expect(ten.safeParse({ "q-1": 11 }).success).toBe(false);
  });

  it("SCALE: межі з config, 0 допустимий, якщо шкала з нуля", () => {
    const schema = build({ type: "SCALE", config: { min: 0, max: 4 } });

    expect(schema.safeParse({ "q-1": 0 }).success).toBe(true);
    expect(schema.safeParse({ "q-1": 4 }).success).toBe(true);
    expect(schema.safeParse({ "q-1": -1 }).success).toBe(false);
    expect(schema.safeParse({ "q-1": 5 }).success).toBe(false);
  });

  it("NPS: 0..10, і 0 - це відповідь, а не порожнє значення", () => {
    const schema = build({ type: "NPS", required: true });

    expect(schema.safeParse({ "q-1": 0 }).success).toBe(true);
    expect(schema.safeParse({ "q-1": 10 }).success).toBe(true);
    expect(schema.safeParse({ "q-1": 11 }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("необов'язкова шкала може бути пропущена; приховану (умовою) можна не передавати", () => {
    expect(build({ type: "NPS", required: false }).safeParse({}).success).toBe(true);

    const hidden = buildResponseSchema(
      [makeQuestion({ type: "RATING", required: true })],
      new Set<string>(),
    );
    expect(hidden.safeParse({}).success).toBe(true);
  });
});

describe("buildResponseSchema — NUMBER зі слайдером", () => {
  const slider = buildResponseSchema([
    makeQuestion({
      type: "NUMBER",
      config: { numberVariant: "slider", min: 0, max: 1, step: 0.1 },
    }),
  ]);

  it("приймає лише значення на сітці кроку (з допуском для дробів)", () => {
    expect(slider.safeParse({ "q-1": 0.3 }).success).toBe(true);
    expect(slider.safeParse({ "q-1": 0.7 }).success).toBe(true);
    expect(slider.safeParse({ "q-1": 0.35 }).success).toBe(false);
  });

  it("без слайдера крок не перевіряється", () => {
    const plain = buildResponseSchema([
      makeQuestion({ type: "NUMBER", config: { min: 0, max: 1, step: 0.1 } }),
    ]);

    expect(plain.safeParse({ "q-1": 0.35 }).success).toBe(true);
  });
});

describe("buildResponseSchema — загальне", () => {
  it("кидає для непідтримуваного типу питання", () => {
    expect(() => buildResponseSchema([makeQuestion({ type: "UNKNOWN" as any })])).toThrow(
      /Unhandled question type/,
    );
  });

  it("будує комбіновану схему з кількох питань одночасно", () => {
    const schema = buildResponseSchema([
      makeQuestion({ id: "name", type: "TEXT", required: true }),
      makeQuestion({ id: "age", type: "NUMBER", required: false, config: { min: 0 } }),
      makeQuestion({ id: "agree", type: "BOOLEAN", required: true }),
    ]);

    const result = schema.safeParse({ name: "Олександр", agree: true });
    expect(result.success).toBe(true);

    const invalid = schema.safeParse({ name: "", agree: false });
    expect(invalid.success).toBe(false);
  });

  it("порожній масив питань дає схему, що приймає порожній об'єкт", () => {
    const schema = buildResponseSchema([]);

    expect(schema.safeParse({}).success).toBe(true);
  });
});

describe("buildResponseSchema: pattern (RE2, захист від ReDoS)", () => {
  const textQuestion = (pattern: string) => [
    { id: "q1", type: "TEXT", required: true, config: { pattern } },
  ];

  it("перевіряє формат за шаблоном", () => {
    const schema = buildResponseSchema(textQuestion("^\\d{3}$"));

    expect(schema.safeParse({ q1: "123" }).success).toBe(true);
    expect(schema.safeParse({ q1: "12a" }).success).toBe(false);
  });

  it("катастрофічний шаблон не блокує виконання", () => {
    const schema = buildResponseSchema(textQuestion("^(a+)+$"));
    const started = Date.now();

    expect(schema.safeParse({ q1: "a".repeat(5_000) + "b" }).success).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("шаблон, що не компілюється в RE2, пропускається, а не кидає 500", () => {
    const schema = buildResponseSchema(textQuestion("(?=a)b"));

    expect(schema.safeParse({ q1: "anything" }).success).toBe(true);
  });
});

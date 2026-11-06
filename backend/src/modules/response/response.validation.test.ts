import { describe, expect, it } from "vitest";
import { Question } from "../../shared/types/questions.js";
import { buildResponseSchema, cleanAnswers } from "./response.validation.js";

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
      new Set<string>(), // no question is visible
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

describe("buildResponseSchema / cleanAnswers - варіант «Інше»", () => {
  const options = [
    { id: "a", text: "A", isDefault: false },
    { id: "o", text: "Інше", isDefault: false, isOther: true },
  ];
  const single = makeQuestion({ id: "q", type: "CHOICE_SINGLE", options } as Partial<Question>);
  const multi = makeQuestion({ id: "q", type: "CHOICE_MULTI", options } as Partial<Question>);

  const firstIssue = (schema: ReturnType<typeof buildResponseSchema>, data: unknown) => {
    const result = schema.safeParse(data);

    return result.success ? null : result.error.issues[0];
  };

  it("обране «Інше» без тексту - помилка на id питання (а не на службовий ключ)", () => {
    const schema = buildResponseSchema([single]);

    for (const data of [{ q: "o" }, { q: "o", q__other: "" }, { q: "o", q__other: "   " }]) {
      const issue = firstIssue(schema, data);

      expect(issue?.path).toEqual(["q"]);
      expect(issue?.message).toBe("VALIDATION_FIELD_REQUIRED");
    }
  });

  it("обране «Інше» з текстом проходить; текст не рядок або задовгий - помилка", () => {
    const schema = buildResponseSchema([single]);

    expect(schema.safeParse({ q: "o", q__other: "свій варіант" }).success).toBe(true);
    expect(firstIssue(schema, { q: "o", q__other: 5 })?.path).toEqual(["q"]);
    expect(firstIssue(schema, { q: "o", q__other: "x".repeat(501) })?.message).toBe(
      "VALIDATION_FORMAT_INVALID",
    );
  });

  it("текст не потрібен, поки обрано інший варіант", () => {
    expect(buildResponseSchema([single]).safeParse({ q: "a" }).success).toBe(true);
  });

  it("CHOICE_MULTI: «Інше» разом з іншими варіантами теж вимагає текст", () => {
    const schema = buildResponseSchema([multi]);

    expect(firstIssue(schema, { q: ["a", "o"] })?.path).toEqual(["q"]);
    expect(schema.safeParse({ q: ["a", "o"], q__other: "x" }).success).toBe(true);
    expect(schema.safeParse({ q: ["a"] }).success).toBe(true);
  });

  it("приховане питання не вимагає тексту", () => {
    const schema = buildResponseSchema([single], new Set<string>());

    expect(schema.safeParse({ q: "o" }).success).toBe(true);
  });

  it("cleanAnswers: зберігає текст лише якщо «Інше» обране, обрізає пробіли", () => {
    const visible = new Set(["q"]);

    expect(cleanAnswers([single], { q: "o", q__other: "  мій  " }, visible)).toEqual({
      q: "o",
      q__other: "мій",
    });
    // the respondent changed their mind: the leftover text is not stored
    expect(cleanAnswers([single], { q: "a", q__other: "старий" }, visible)).toEqual({ q: "a" });
    expect(cleanAnswers([multi], { q: ["a", "o"], q__other: "x" }, visible)).toEqual({
      q: ["a", "o"],
      q__other: "x",
    });
  });

  it("cleanAnswers: відкидає відповіді (і текст) прихованих питань", () => {
    expect(cleanAnswers([single], { q: "o", q__other: "x" }, new Set())).toEqual({});
  });
});

describe("buildResponseSchema - RANKING", () => {
  const options = ["a", "b", "c"].map((id) => ({ id, text: id, isDefault: false }));
  const build = (extra: Partial<Question> = {}) =>
    buildResponseSchema([makeQuestion({ id: "q", type: "RANKING", options, ...extra } as Partial<Question>)]);

  it("приймає будь-яку повну перестановку варіантів", () => {
    const schema = build();

    expect(schema.safeParse({ q: ["a", "b", "c"] }).success).toBe(true);
    expect(schema.safeParse({ q: ["c", "a", "b"] }).success).toBe(true);
  });

  it("відхиляє неповне ранжування, дублікати, зайві й чужі id", () => {
    const schema = build();

    expect(schema.safeParse({ q: ["a", "b"] }).success).toBe(false);
    expect(schema.safeParse({ q: ["a", "a", "b"] }).success).toBe(false);
    expect(schema.safeParse({ q: ["a", "b", "c", "a"] }).success).toBe(false);
    expect(schema.safeParse({ q: ["a", "b", "x"] }).success).toBe(false);
    expect(schema.safeParse({ q: "a" }).success).toBe(false);
    expect(schema.safeParse({ q: [] }).success).toBe(false);
  });

  it("обов'язкове питання не можна пропустити, необов'язкове - можна", () => {
    expect(build({ required: true }).safeParse({}).success).toBe(false);
    expect(build({ required: false }).safeParse({}).success).toBe(true);
  });
});

describe("cleanAnswers - MATRIX", () => {
  const matrix = makeQuestion({
    id: "q",
    type: "MATRIX",
    options: [{ id: "a", text: "A", isDefault: false }],
    config: { rows: [{ id: "r1", text: "R" }] },
  } as Partial<Question>);
  const visible = new Set(["q"]);

  it("порожня матриця не зберігається як відповідь", () => {
    expect(cleanAnswers([matrix], { q: {} }, visible)).toEqual({});
  });

  it("непорожня (навіть часткова) матриця зберігається", () => {
    expect(cleanAnswers([matrix], { q: { r1: "a" } }, visible)).toEqual({ q: { r1: "a" } });
  });
});

describe("buildResponseSchema - MATRIX", () => {
  const columns = ["a", "b", "c"].map((id) => ({ id, text: id, isDefault: false }));
  const rows = [
    { id: "r1", text: "Перший" },
    { id: "r2", text: "Другий" },
  ];
  const build = (extra: Partial<Question> = {}) =>
    buildResponseSchema([
      makeQuestion({
        id: "q",
        type: "MATRIX",
        options: columns,
        config: { rows },
        ...extra,
      } as Partial<Question>),
    ]);

  it("приймає по одній колонці на кожен рядок", () => {
    const schema = build({ required: true });

    expect(schema.safeParse({ q: { r1: "a", r2: "c" } }).success).toBe(true);
  });

  it("обов'язкова: усі рядки мають бути заповнені", () => {
    const schema = build({ required: true });

    expect(schema.safeParse({ q: { r1: "a" } }).success).toBe(false);
    expect(schema.safeParse({ q: {} }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("необов'язкова: можна пропустити питання або заповнити частину рядків", () => {
    const schema = build({ required: false });

    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ q: {} }).success).toBe(true);
    expect(schema.safeParse({ q: { r2: "b" } }).success).toBe(true);
  });

  it("відхиляє чужу колонку, чужий рядок і неправильний тип значення", () => {
    const schema = build({ required: false });

    expect(schema.safeParse({ q: { r1: "x" } }).success).toBe(false);
    expect(schema.safeParse({ q: { nope: "a" } }).success).toBe(false);
    expect(schema.safeParse({ q: { r1: ["a"] } }).success).toBe(false);
    expect(schema.safeParse({ q: "a" }).success).toBe(false);
    expect(schema.safeParse({ q: ["a"] }).success).toBe(false);
  });

  it("помилка віддається на id питання (path[0]), щоб клієнт показав її біля питання", () => {
    const result = build({ required: true }).safeParse({ q: { r1: "a" } });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path[0]).toBe("q");
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

import { describe, expect, it } from "vitest";
import type { Question } from "../../types/formBuilder";
import {
  checkCalculation,
  defaultCalculationConfig,
  findCalculationProblems,
  referenceableQuestions,
  runCalculationTest,
  testInputQuestions,
} from "./calculation";

const q = (id: string, type: Question["type"], extra: Partial<Question> = {}): Question => ({
  id,
  type,
  text: id,
  required: false,
  order: 0,
  options: [],
  config: null,
  ...extra,
});

const plan = q("plan", "CHOICE_SINGLE", {
  options: [
    { id: "basic", text: "Basic", isDefault: false, score: 1500 },
    { id: "pro", text: "Pro", isDefault: false, score: 2500.5 },
  ],
});
const seats = q("seats", "NUMBER");
const date = q("when", "DATE");

const calc = (id: string, formula: string, config: Question["config"] = null): Question =>
  q(id, "CALCULATION", { config: { ...defaultCalculationConfig(), formula, ...config } });

describe("referenceableQuestions", () => {
  it("offers what a formula can read, without the field itself", () => {
    const total = calc("total", "1");
    const ids = referenceableQuestions([plan, seats, date, total, calc("other", "2")], "total").map(
      (x) => x.id,
    );

    // DATE cannot be used; another calculation can; the field itself cannot.
    expect(ids).toEqual(["plan", "seats", "other"]);
  });

  it("skips questions that are not saved yet", () => {
    expect(referenceableQuestions([{ ...seats, id: undefined }], undefined)).toEqual([]);
  });
});

describe("checkCalculation", () => {
  const questions = (formula: string, config?: Question["config"]) => [
    plan,
    seats,
    date,
    calc("total", formula, config),
  ];
  const check = (formula: string, config?: Question["config"]) => {
    const list = questions(formula, config);

    return checkCalculation(list[3]!, list);
  };

  it("accepts a valid formula", () => {
    expect(check("{q:plan} * {q:seats}")).toBeNull();
  });

  it("reports an empty formula, a syntax error with its position and a type error", () => {
    expect(check("")).toMatchObject({ code: "EMPTY_FORMULA" });
    expect(check("{q:seats} + * 2")).toMatchObject({ code: "UNEXPECTED_TOKEN", pos: 12 });
    expect(check('{q:seats} + "a"')).toMatchObject({ code: "TYPE_MISMATCH" });
    expect(check("{q:when}")).toMatchObject({ code: "UNSUPPORTED_REFERENCE" });
    expect(check("{q:gone}")).toMatchObject({ code: "UNKNOWN_REFERENCE" });
  });

  it("the message is a translation key", () => {
    expect(check("1 +")?.messageKey).toBe("builder.editors.calculation.errors.UNEXPECTED_END");
  });

  it("reports a circle and a visible field reading a hidden one", () => {
    const a = calc("a", "{q:b}");
    const b = calc("b", "{q:a}");

    expect(checkCalculation(a, [a, b])).toMatchObject({ code: "FORMULA_CYCLE" });
    expect(checkCalculation(b, [a, b])).toMatchObject({ code: "FORMULA_CYCLE" });

    const hidden = calc("hidden", "{q:seats}", { display: "hidden" });
    const shown = calc("shown", "{q:hidden}");

    expect(checkCalculation(shown, [seats, hidden, shown])).toMatchObject({
      code: "HIDDEN_REFERENCE",
    });
    expect(checkCalculation(hidden, [seats, hidden, shown])).toBeNull();
  });

  it("the problems of a whole form are keyed by question index", () => {
    const list = [seats, calc("good", "{q:seats}"), calc("bad", "1 +")];

    expect([...findCalculationProblems(list)]).toEqual([
      [2, "builder.editors.calculation.errors.UNEXPECTED_END"],
    ]);
  });
});

describe("the test panel", () => {
  const total = calc("total", "{q:plan} * {q:seats} * 1.075", { prefix: "$", decimals: 2 });
  const list = [plan, seats, q("note", "TEXT"), total];

  it("asks only for the questions the formula reads, following other calculations", () => {
    expect(testInputQuestions(total, list).map((x) => x.id)).toEqual(["plan", "seats"]);

    const chain = calc("chain", "{q:total} + 1");

    expect(testInputQuestions(chain, [...list, chain]).map((x) => x.id)).toEqual(["plan", "seats"]);
  });

  it("computes the value for sample answers, as the server would", () => {
    expect(runCalculationTest(total, list, { plan: "pro", seats: 3 })).toEqual({
      value: 8064.11,
      text: "$8,064.11",
      error: null,
    });
  });

  it("shows why there is no value", () => {
    const division = calc("division", "{q:plan} / {q:seats}");
    const result = runCalculationTest(division, [plan, seats, division], { plan: "pro" });

    expect(result).toEqual({ value: null, text: null, error: "DIVISION_BY_ZERO" });
  });
});

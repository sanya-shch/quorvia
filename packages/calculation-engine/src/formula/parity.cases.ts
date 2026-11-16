import type { CalcValue, FormulaQuestion } from "./types.js";

/**
 * One set of cases that the server, the builder and the viewer all run: the same answers must give
 * the same value everywhere, because they all use this package. Each side has a test that runs these
 * through its own entry point (the engine directly, the server's submit step, the viewer's live
 * calculation). Anything a side adds around the engine (hiding questions, dropping client values)
 * is tested on its own.
 */
export interface ParityCase {
  name: string;
  questions: FormulaQuestion[];
  answers: Record<string, unknown>;
  // The questions the respondent was shown; omitted means all of them.
  visibleQuestionIds?: string[];
  // Every calculation field of the case: its value, or null when it has none.
  expected: Record<string, CalcValue | null>;
}

const plan: FormulaQuestion = {
  id: "plan",
  type: "CHOICE_SINGLE",
  options: [
    { id: "basic", text: "Basic", score: 1500 },
    { id: "pro", text: "Pro", score: 2500.5 },
  ],
};
const extras: FormulaQuestion = {
  id: "extras",
  type: "CHOICE_MULTI",
  options: [
    { id: "sso", text: "SSO", score: 100.25 },
    { id: "audit", text: "Audit", score: 50 },
  ],
};
const seats: FormulaQuestion = { id: "seats", type: "NUMBER" };
const agree: FormulaQuestion = {
  id: "agree",
  type: "BOOLEAN",
  config: { score: { true: 5, false: 1 } },
};
const note: FormulaQuestion = { id: "note", type: "TEXT" };

const calc = (
  id: string,
  formula: string,
  config: Record<string, unknown> = {},
): FormulaQuestion => ({
  id,
  type: "CALCULATION",
  config: { formula, resultType: "number", ...config },
});

export const PARITY_CASES: ParityCase[] = [
  {
    name: "a price calculator is exact to the cent",
    questions: [plan, extras, seats, calc("total", "({q:plan} + {q:extras}) * {q:seats} * 1.075")],
    answers: { plan: "pro", extras: ["sso", "audit"], seats: 3 },
    // 2650.75 * 3 * 1.075 = 8548.66875
    expected: { total: 8548.67 },
  },
  {
    name: "sums of tenths do not drift",
    questions: [seats, calc("sum", "0.1 + 0.2 + {q:seats}", { decimals: 8 })],
    answers: { seats: 0.7 },
    expected: { sum: 1 },
  },
  {
    name: "rounding is half away from zero",
    questions: [
      seats,
      calc("up", "ROUND({q:seats}, 2)"),
      calc("down", "ROUND(-{q:seats}, 2)"),
      calc("floor", "FLOOR({q:seats}, 2)"),
      calc("ceil", "CEIL({q:seats}, 2)"),
    ],
    answers: { seats: 2.675 },
    expected: { up: 2.68, down: -2.68, floor: 2.67, ceil: 2.68 },
  },
  {
    name: "empty answers count as zero, text as empty, yes/no as no",
    questions: [
      plan,
      seats,
      note,
      agree,
      calc("n", "{q:seats} + 1"),
      calc("c", "{q:plan}"),
      calc("t", 'CONCAT("[", {q:note}, "]")', { resultType: "string" }),
      calc("b", "{q:agree}", { resultType: "boolean" }),
    ],
    answers: {},
    expected: { n: 1, c: 0, t: "[]", b: false },
  },
  {
    name: "emptyAsZero off gives no value until the question is answered",
    questions: [seats, calc("strict", "{q:seats} * 2", { emptyAsZero: false })],
    answers: {},
    expected: { strict: null },
  },
  {
    name: "emptyAsZero off with an answer",
    questions: [seats, calc("strict", "{q:seats} * 2", { emptyAsZero: false })],
    answers: { seats: 4 },
    expected: { strict: 8 },
  },
  {
    name: "a question that was not shown counts as empty",
    questions: [plan, seats, calc("total", "{q:plan} + {q:seats}")],
    answers: { plan: "pro", seats: 10 },
    visibleQuestionIds: ["plan", "total"],
    expected: { total: 2500.5 },
  },
  {
    name: "division by zero gives no value, a guarded one does",
    questions: [
      seats,
      calc("bad", "10 / {q:seats}"),
      calc("safe", "IF({q:seats} = 0, 0, 10 / {q:seats})"),
    ],
    answers: { seats: 0 },
    expected: { bad: null, safe: 0 },
  },
  {
    name: "calculation fields read each other",
    questions: [
      seats,
      calc("double", "{q:seats} * 2"),
      calc("quad", "{q:double} * 2"),
      calc("big", "{q:quad} > 10", { resultType: "boolean" }),
      calc("label", 'IF({q:big}, "large", "small")', { resultType: "string" }),
    ],
    answers: { seats: 3 },
    expected: { double: 6, quad: 12, big: true, label: "large" },
  },
  {
    name: "option text, counts, points and text functions",
    questions: [
      plan,
      extras,
      agree,
      note,
      calc("name", "UPPER(LABEL({q:plan}))", { resultType: "string" }),
      calc("count", "COUNT({q:extras})"),
      calc("points", "SCORE({q:agree}) + SCORE({q:extras})"),
      calc("lower", "LOWER({q:note})", { resultType: "string" }),
    ],
    answers: { plan: "basic", extras: ["audit", "sso", "ghost"], agree: true, note: "HeLLo" },
    expected: { name: "BASIC", count: 2, points: 155.25, lower: "hello" },
  },
  {
    name: "an answer of the wrong kind is empty, not an error",
    questions: [seats, plan, calc("n", "{q:seats} + {q:plan} + 1")],
    answers: { seats: "many", plan: ["basic"] },
    expected: { n: 1 },
  },
  {
    name: "a value too large to keep gives no value",
    questions: [seats, calc("huge", "{q:seats} * {q:seats} * {q:seats}")],
    answers: { seats: 100000 },
    expected: { huge: null },
  },
  {
    name: "MIN, MAX, SUM, AVG, ABS",
    questions: [
      seats,
      calc("min", "MIN({q:seats}, 3, 8)"),
      calc("max", "MAX({q:seats}, 3, 8)"),
      calc("sum", "SUM({q:seats}, 3, 8)"),
      calc("avg", "AVG({q:seats}, 3, 8)"),
      calc("abs", "ABS({q:seats} - 100)"),
    ],
    answers: { seats: 4 },
    expected: { min: 3, max: 8, sum: 15, avg: 5, abs: 96 },
  },
];

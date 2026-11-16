import { describe, expect, it } from "vitest";
import { PARITY_CASES } from "@quorvia/calculation-engine/parity";
import type { Question } from "../../types/formBuilder";
import { calculateValues, isHiddenCalculation, withCalculatedValues } from "./calculations";

const toQuestion = (
  q: (typeof PARITY_CASES)[number]["questions"][number],
  order: number,
): Question => ({
  id: q.id,
  type: q.type,
  text: q.id,
  required: false,
  order,
  options: (q.options ?? []).map((o) => ({
    id: o.id,
    text: o.text ?? o.id,
    isDefault: false,
    score: o.score ?? undefined,
  })),
  config: q.config ?? null,
});

// The viewer's live calculation gives the same values as the server for the same answers (the cases
// are shared with the formula engine's and the server's tests).
describe("calculation parity: the viewer", () => {
  it.each(PARITY_CASES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const visible = c.visibleQuestionIds ? new Set(c.visibleQuestionIds) : null;
    const values = calculateValues(c.questions.map(toQuestion), c.answers, visible);

    expect(
      Object.fromEntries(Object.keys(c.expected).map((id) => [id, values[id] ?? null])),
    ).toEqual(c.expected);
  });
});

describe("viewer helpers", () => {
  it("a form without calculations costs nothing and gives no values", () => {
    const values = calculateValues([toQuestion({ id: "a", type: "NUMBER" }, 0)], { a: 1 }, null);

    expect(values).toEqual({});
  });

  it("recognizes a calculation hidden from the respondent", () => {
    const hidden = toQuestion(
      {
        id: "h",
        type: "CALCULATION",
        config: { formula: "1", resultType: "number", display: "hidden" },
      },
      0,
    );
    const shown = toQuestion(
      { id: "s", type: "CALCULATION", config: { formula: "1", resultType: "number" } },
      1,
    );

    expect(isHiddenCalculation(hidden)).toBe(true);
    expect(isHiddenCalculation(shown)).toBe(false);
    expect(isHiddenCalculation(toQuestion({ id: "n", type: "NUMBER" }, 2))).toBe(false);
  });

  it("puts the computed values among the answers, and leaves out one that has no value", () => {
    expect(withCalculatedValues({ a: 1 }, { total: 5, none: null })).toEqual({ a: 1, total: 5 });
    expect(withCalculatedValues({ a: 1, none: "stale" }, { none: null })).toEqual({ a: 1 });
  });
});

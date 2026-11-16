import { describe, expect, it } from "vitest";
import { PARITY_CASES } from "@quorvia/calculation-engine/parity";
import { calculateSubmission } from "./form.calculation.js";

// The server's submit step gives the same values as the other sides for the same answers (the cases
// are shared with the formula engine's and the viewer's tests).
describe("calculation parity: the server", () => {
  it.each(PARITY_CASES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const visible = new Set(c.visibleQuestionIds ?? c.questions.map((q) => q.id));
    const { values, answers } = calculateSubmission(c.questions, c.answers, visible);

    expect(
      Object.fromEntries(Object.keys(c.expected).map((id) => [id, values[id] ?? null])),
    ).toEqual(c.expected);
    // What is stored next to the answers: the computed values, and nothing for a value that is missing.
    for (const [id, value] of Object.entries(c.expected)) {
      if (value === null) expect(answers).not.toHaveProperty(id);
      else expect(answers[id]).toBe(value);
    }
  });
});

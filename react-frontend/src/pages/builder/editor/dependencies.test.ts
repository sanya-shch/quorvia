import { describe, expect, it } from "vitest";
import type { Question } from "../../../types/formBuilder";
import { clearConditionsOn, findDependents, questionsBrokenByMove } from "./dependencies";

const q = (id: string, dependsOn?: string): Question => ({
  id,
  type: "TEXT",
  text: id,
  required: false,
  order: 0,
  options: [],
  config: null,
  condition: dependsOn
    ? { logic: "AND", rules: [{ questionId: dependsOn, operator: "equals", value: "x" }] }
    : null,
});

// a, b (depends on a), c
const form = [q("a"), q("b", "a"), q("c")];

describe("findDependents", () => {
  it("знаходить питання, чия умова дивиться на це", () => {
    expect(findDependents(form, "a").map((x) => x.id)).toEqual(["b"]);
    expect(findDependents(form, "c")).toEqual([]);
  });
});

describe("questionsBrokenByMove", () => {
  it("перенесення залежного питання вище за його джерело ламає умову - повертає його", () => {
    expect(questionsBrokenByMove(form, 1, 0).map((x) => x.id)).toEqual(["b"]);
  });

  it("перенесення джерела нижче за залежне теж ламає умову залежного", () => {
    expect(questionsBrokenByMove(form, 0, 2).map((x) => x.id)).toEqual(["b"]);
  });

  it("безпечне перенесення не повертає нічого", () => {
    expect(questionsBrokenByMove(form, 2, 1)).toEqual([]);
    expect(questionsBrokenByMove(form, 2, 0)).toEqual([]);
  });

  it("умова, зламана ще до переносу, не ставиться в провину переносу", () => {
    const broken = [q("b", "a"), q("a"), q("c")]; // b already looks at a later question
    expect(questionsBrokenByMove(broken, 2, 0)).toEqual([]);
  });
});

describe("clearConditionsOn", () => {
  it("прибирає умови лише тих, хто залежав від питання", () => {
    const result = clearConditionsOn(form, "a");

    expect(result.find((x) => x.id === "b")!.condition).toBeNull();
    expect(result.find((x) => x.id === "c")).toBe(form[2]);
  });
});

import { describe, expect, it } from "vitest";
import { END_RULE_LIMITS, type FormEndRule } from "@quorvia/shared-types";
import type { Question } from "../../types/formBuilder";
import {
  canAddEndRule,
  conditionTargets,
  createEndRule,
  findBrokenEndRules,
  isConditionValueFilled,
  isEndRuleComplete,
  moveEndRule,
  prepareEndRules,
} from "./endRules";

const question = (overrides: Partial<Question> = {}): Question => ({
  id: "q1",
  text: "Оцінка",
  type: "NUMBER",
  required: false,
  order: 0,
  options: [],
  config: null,
  ...overrides,
});

const rule = (overrides: Partial<FormEndRule> = {}): FormEndRule => ({
  id: "r1",
  condition: { logic: "AND", rules: [{ questionId: "q1", operator: "gt", value: 5 }] },
  screen: { text: "Дякуємо", redirectUrl: "" },
  ...overrides,
});

describe("conditionTargets", () => {
  it("keeps saved questions whose answer can be compared", () => {
    const questions = [
      question(),
      question({ id: "q2", type: "RANKING" }),
      question({ id: "q3", type: "MATRIX" }),
      question({ id: "q4", type: "FILE" }),
      question({ id: undefined, type: "TEXT" }),
      question({ id: "q6", type: "CHOICE_MULTI" }),
    ];

    expect(conditionTargets(questions).map((q) => q.id)).toEqual(["q1", "q6"]);
  });
});

describe("createEndRule", () => {
  it("starts from the first usable question with an empty value and message", () => {
    const created = createEndRule([question({ id: "r", type: "RANKING" }), question()]);

    expect(created).toMatchObject({
      condition: { logic: "AND", rules: [{ questionId: "q1", operator: "equals", value: "" }] },
      screen: { text: "", redirectUrl: "" },
    });
    expect(created?.id).toBeTruthy();
  });

  it("gives every rule its own id", () => {
    expect(createEndRule([question()])?.id).not.toBe(createEndRule([question()])?.id);
  });

  it("returns null when no question can be used", () => {
    expect(createEndRule([])).toBeNull();
    expect(createEndRule([question({ type: "MATRIX" })])).toBeNull();
  });
});

describe("canAddEndRule", () => {
  it("needs a usable question and room under the limit", () => {
    const rules = Array.from({ length: END_RULE_LIMITS.rules }, (_, i) => rule({ id: `r${i}` }));

    expect(canAddEndRule(null, [question()])).toBe(true);
    expect(canAddEndRule([], [])).toBe(false);
    expect(canAddEndRule(rules, [question()])).toBe(false);
    expect(canAddEndRule(rules.slice(1), [question()])).toBe(true);
  });
});

describe("completeness", () => {
  it.each([
    [5, true],
    [0, true],
    [false, true],
    ["x", true],
    [["a"], true],
    ["", false],
    ["   ", false],
    [[], false],
    [Number.NaN, false],
  ])("value %j is filled: %s", (value, filled) => {
    expect(isConditionValueFilled(value as never)).toBe(filled);
  });

  it("a rule needs a message and a value in every condition", () => {
    expect(isEndRuleComplete(rule())).toBe(true);
    expect(isEndRuleComplete(rule({ screen: { text: "  " } }))).toBe(false);
    expect(
      isEndRuleComplete(
        rule({
          condition: { logic: "OR", rules: [{ questionId: "q1", operator: "gt", value: "" }] },
        }),
      ),
    ).toBe(false);
  });
});

describe("findBrokenEndRules", () => {
  it("finds the rules that look at a missing or unusable question", () => {
    const rules = [
      rule({ id: "ok" }),
      rule({
        id: "gone",
        condition: { logic: "AND", rules: [{ questionId: "x", operator: "gt", value: 1 }] },
      }),
      rule({
        id: "rank",
        condition: { logic: "AND", rules: [{ questionId: "q2", operator: "gt", value: 1 }] },
      }),
    ];
    const questions = [question(), question({ id: "q2", type: "RANKING" })];

    expect(findBrokenEndRules(rules, questions)).toEqual([1, 2]);
    expect(findBrokenEndRules(null, questions)).toEqual([]);
  });
});

describe("findBrokenEndRules and the score", () => {
  const onScore = [
    rule({
      id: "a",
      condition: { logic: "AND", rules: [{ questionId: "$score", operator: "gt", value: 5 }] },
    }),
    rule({
      id: "b",
      condition: { logic: "AND", rules: [{ questionId: "$percent", operator: "lt", value: 50 }] },
    }),
  ];

  it("a rule on the score is broken unless scoring is on", () => {
    expect(findBrokenEndRules(onScore, [question()])).toEqual([0, 1]);
    expect(findBrokenEndRules(onScore, [question()], false)).toEqual([0, 1]);
    expect(findBrokenEndRules(onScore, [question()], true)).toEqual([]);
  });

  it("scoring does not excuse a rule on another unknown key", () => {
    const other = rule({
      condition: { logic: "AND", rules: [{ questionId: "$other", operator: "gt", value: 1 }] },
    });

    expect(findBrokenEndRules([other], [question()], true)).toEqual([0]);
  });
});

describe("prepareEndRules", () => {
  it("sends the finished rules in order and drops the unfinished ones", () => {
    const rules = [
      rule({ id: "a" }),
      rule({ id: "unfinished", screen: { text: "" } }),
      rule({ id: "b", screen: { text: "Ще", redirectUrl: "https://example.com" } }),
    ];

    expect(prepareEndRules(rules)?.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("drops a redirect that is not http(s) but keeps the rule", () => {
    const [prepared] = prepareEndRules([rule({ screen: { text: "Hi", redirectUrl: "ftp://x" } })])!;

    expect(prepared!.screen).toEqual({ text: "Hi" });
  });

  it("returns null when nothing is left", () => {
    expect(prepareEndRules(null)).toBeNull();
    expect(prepareEndRules([])).toBeNull();
    expect(prepareEndRules([rule({ screen: { text: "" } })])).toBeNull();
  });
});

describe("moveEndRule", () => {
  const rules = [rule({ id: "a" }), rule({ id: "b" }), rule({ id: "c" })];
  const ids = (list: FormEndRule[]) => list.map((r) => r.id);

  it("moves a rule up and down", () => {
    expect(ids(moveEndRule(rules, 2, 0))).toEqual(["c", "a", "b"]);
    expect(ids(moveEndRule(rules, 0, 1))).toEqual(["b", "a", "c"]);
  });

  it("ignores moves out of range and does not change the input", () => {
    expect(ids(moveEndRule(rules, 0, 3))).toEqual(["a", "b", "c"]);
    expect(ids(moveEndRule(rules, -1, 1))).toEqual(["a", "b", "c"]);
    expect(ids(rules)).toEqual(["a", "b", "c"]);
  });
});

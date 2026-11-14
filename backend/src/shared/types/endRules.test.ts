import { describe, expect, it } from "vitest";
import {
  END_RULE_LIMITS,
  isQuotaFull,
  localizeEndRuleScreen,
  normalizeConditionGroup,
  normalizeEndRules,
  normalizeFormTranslations,
  questionTypeSupportsConditions,
  stripOutcomeTranslations,
  type FormEndRule,
} from "@quorvia/shared-types";

const rule = (overrides: Record<string, unknown> = {}) => ({
  id: "r1",
  condition: { logic: "AND", rules: [{ questionId: "q1", operator: "gt", value: 7 }] },
  screen: { text: "Thank you!", redirectUrl: "https://example.com/thanks" },
  ...overrides,
});

describe("normalizeEndRules", () => {
  it("keeps a valid rule as it is", () => {
    expect(normalizeEndRules([rule()])).toEqual([rule()]);
  });

  it("keeps the order of the rules", () => {
    const result = normalizeEndRules([rule({ id: "b" }), rule({ id: "a" }), rule({ id: "c" })]);

    expect(result?.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it.each([null, undefined, "x", 5, {}, []])("returns null for %j", (raw) => {
    expect(normalizeEndRules(raw)).toBeNull();
  });

  it("drops rules that are not objects", () => {
    expect(normalizeEndRules([null, 5, "x", rule()])).toEqual([rule()]);
  });

  it("drops a rule without a usable id", () => {
    expect(normalizeEndRules([rule({ id: "" }), rule({ id: "   " }), rule({ id: 5 })])).toBeNull();
    expect(normalizeEndRules([rule({ id: "x".repeat(END_RULE_LIMITS.id + 1) })])).toBeNull();
  });

  it("drops a rule that repeats an id, keeping the first", () => {
    const first = rule({ screen: { text: "first" } });
    const second = rule({ screen: { text: "second" } });

    expect(normalizeEndRules([first, second])).toEqual([first]);
  });

  it("drops a rule without screen text", () => {
    expect(normalizeEndRules([rule({ screen: { text: "" } }), rule({ screen: {} })])).toBeNull();
    expect(normalizeEndRules([rule({ screen: null })])).toBeNull();
  });

  it("drops a redirect that is not http(s) but keeps the screen", () => {
    const result = normalizeEndRules([
      rule({ screen: { text: "Hi", redirectUrl: "javascript:alert(1)" } }),
    ]);

    expect(result).toEqual([rule({ screen: { text: "Hi" } })]);
  });

  it("strips unknown fields from the rule, condition and screen", () => {
    const result = normalizeEndRules([
      {
        ...rule(),
        extra: true,
        condition: {
          logic: "OR",
          extra: 1,
          rules: [{ questionId: "q1", operator: "equals", value: "a", extra: 1 }],
        },
        screen: { text: "Hi", extra: 1 },
      },
    ]);

    expect(result).toEqual([
      {
        id: "r1",
        condition: { logic: "OR", rules: [{ questionId: "q1", operator: "equals", value: "a" }] },
        screen: { text: "Hi" },
      },
    ]);
  });

  it("drops rules beyond the limit", () => {
    const many = Array.from({ length: END_RULE_LIMITS.rules + 3 }, (_, i) => rule({ id: `r${i}` }));

    expect(normalizeEndRules(many)).toHaveLength(END_RULE_LIMITS.rules);
  });

  describe("conditions", () => {
    const withCondition = (condition: unknown) => normalizeEndRules([rule({ condition })]);
    const ruleOf = (value: unknown, operator: unknown = "equals", questionId: unknown = "q1") => ({
      logic: "AND",
      rules: [{ questionId, operator, value }],
    });

    it.each([null, "x", [], {}, { logic: "AND" }, { logic: "AND", rules: [] }])(
      "rejects %j",
      (condition) => {
        expect(withCondition(condition)).toBeNull();
      },
    );

    it("rejects an unknown logic", () => {
      expect(withCondition({ logic: "XOR", rules: ruleOf(1).rules })).toBeNull();
      expect(withCondition({ logic: "and", rules: ruleOf(1).rules })).toBeNull();
    });

    it("rejects an unknown operator", () => {
      expect(withCondition(ruleOf(1, "startsWith"))).toBeNull();
      expect(withCondition(ruleOf(1, null))).toBeNull();
    });

    it("rejects a missing or overlong question id", () => {
      expect(withCondition(ruleOf(1, "equals", ""))).toBeNull();
      expect(withCondition(ruleOf(1, "equals", 5))).toBeNull();
      expect(withCondition(ruleOf(1, "equals", "x".repeat(END_RULE_LIMITS.id + 1)))).toBeNull();
    });

    it.each(["text", 0, -3.5, true, false, ["a", "b"], []])("accepts the value %j", (value) => {
      expect(withCondition(ruleOf(value))).not.toBeNull();
    });

    it.each([null, undefined, {}, NaN, Infinity, [1], ["a", 1], "x".repeat(501)])(
      "rejects the value %j",
      (value) => {
        expect(withCondition(ruleOf(value))).toBeNull();
      },
    );

    it("rejects too many value items and too many rules", () => {
      const items = Array.from({ length: END_RULE_LIMITS.conditionValueItems + 1 }, () => "a");
      const rules = Array.from({ length: END_RULE_LIMITS.conditionRules + 1 }, () => ({
        questionId: "q1",
        operator: "equals",
        value: 1,
      }));

      expect(withCondition(ruleOf(items, "in"))).toBeNull();
      expect(withCondition({ logic: "AND", rules })).toBeNull();
    });
  });
});

describe("localizeEndRuleScreen", () => {
  const endRule = normalizeEndRules([rule()])![0] as FormEndRule;
  const translations = { en: { endRules: { r1: "Thanks!", other: "x" } } };

  it("uses the translated text and keeps the redirect", () => {
    expect(localizeEndRuleScreen(endRule, translations, "en")).toEqual({
      text: "Thanks!",
      redirectUrl: "https://example.com/thanks",
    });
  });

  it("falls back to the main language", () => {
    expect(localizeEndRuleScreen(endRule, translations, "de")).toBe(endRule.screen);
    expect(localizeEndRuleScreen(endRule, translations, null)).toBe(endRule.screen);
    expect(localizeEndRuleScreen(endRule, null, "en")).toBe(endRule.screen);
    expect(localizeEndRuleScreen(endRule, { en: { endRules: { r1: "  " } } }, "en")).toBe(
      endRule.screen,
    );
  });

  it("ignores a malformed translation", () => {
    expect(localizeEndRuleScreen(endRule, { en: "oops" }, "en")).toBe(endRule.screen);
    expect(localizeEndRuleScreen(endRule, { en: { endRules: 5 } }, "en")).toBe(endRule.screen);
  });
});

describe("normalizeFormTranslations: end rule texts", () => {
  const input = { en: { endText: "Bye", endRules: { r1: "One", r2: "Two", r3: "" } } };

  it("keeps the texts of the existing rules and drops the others", () => {
    expect(normalizeFormTranslations(input, ["en"], ["r1", "r3"])).toEqual({
      en: { endText: "Bye", endRules: { r1: "One" } },
    });
  });

  it("drops every rule text when no rule exists", () => {
    expect(normalizeFormTranslations(input, ["en"], [])).toEqual({ en: { endText: "Bye" } });
  });

  it("keeps all non-empty rule texts when the ids are not given", () => {
    expect(normalizeFormTranslations(input, ["en"])).toEqual({
      en: { endText: "Bye", endRules: { r1: "One", r2: "Two" } },
    });
  });

  it("drops a language that is left empty", () => {
    expect(
      normalizeFormTranslations({ en: { endRules: { r2: "Two" } } }, ["en"], ["r1"]),
    ).toBeNull();
  });

  it("drops languages that are not in the list", () => {
    expect(normalizeFormTranslations(input, ["de"], ["r1"])).toBeNull();
  });
});

describe("stripOutcomeTranslations", () => {
  it("removes the end rule texts and keeps the rest", () => {
    expect(
      stripOutcomeTranslations({
        en: { title: "T", endText: "Bye", endRules: { r1: "One" } },
        de: { endRules: { r1: "Eins" } },
      }),
    ).toEqual({ en: { title: "T", endText: "Bye" } });
  });

  it("returns null when nothing is left or the input is not translations", () => {
    expect(stripOutcomeTranslations({ en: { endRules: { r1: "One" } } })).toBeNull();
    expect(stripOutcomeTranslations(null)).toBeNull();
    expect(stripOutcomeTranslations("x")).toBeNull();
    expect(stripOutcomeTranslations({ en: "oops" })).toBeNull();
  });
});

describe("questionTypeSupportsConditions", () => {
  it("rejects the types whose answer does not reduce to a simple comparison", () => {
    expect(questionTypeSupportsConditions("NPS")).toBe(true);
    expect(questionTypeSupportsConditions("CHOICE_MULTI")).toBe(true);
    expect(questionTypeSupportsConditions("RANKING")).toBe(false);
    expect(questionTypeSupportsConditions("MATRIX")).toBe(false);
    expect(questionTypeSupportsConditions("FILE")).toBe(false);
  });
});

describe("normalizeConditionGroup", () => {
  it("is the shape check the end rules use, available to quotas too", () => {
    const group = { logic: "OR", rules: [{ questionId: "q1", operator: "in", value: ["a", "b"] }] };

    expect(normalizeConditionGroup(group)).toEqual(group);
    expect(normalizeConditionGroup({ logic: "OR", rules: [] })).toBeNull();
    expect(normalizeConditionGroup("x")).toBeNull();
  });
});

describe("quota helpers", () => {
  it("a quota is full when its count reaches the limit, or passes it after the limit was lowered", () => {
    expect(isQuotaFull({ count: 1, limit: 2 })).toBe(false);
    expect(isQuotaFull({ count: 2, limit: 2 })).toBe(true);
    expect(isQuotaFull({ count: 9, limit: 2 })).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { ErrorCode, type FormEndRule } from "@quorvia/shared-types";
import { assertEndRulesValid, findEndRuleIssues, resolveEndScreen } from "./form.endRules.js";

const rule = (id: string, questionId: string, operator: string, value: unknown, text = id) =>
  ({
    id,
    condition: { logic: "AND", rules: [{ questionId, operator, value }] },
    screen: { text, redirectUrl: `https://example.com/${id}` },
  }) as FormEndRule;

const ALL = new Set(["q1", "q2", "q3"]);

describe("findEndRuleIssues", () => {
  const questions = [
    { id: "q1", type: "NPS" as const },
    { id: "q2", type: "RANKING" as const },
    { id: "q3", type: "MATRIX" as const },
    { id: "q4", type: "FILE" as const },
  ];

  it("accepts rules on questions that exist and support conditions", () => {
    expect(findEndRuleIssues([rule("a", "q1", "gt", 7)], questions)).toEqual([]);
    expect(findEndRuleIssues(null, questions)).toEqual([]);
  });

  it("reports an unknown question", () => {
    expect(findEndRuleIssues([rule("a", "gone", "gt", 7)], questions)).toEqual([
      { ruleId: "a", questionId: "gone", reason: "UNKNOWN_QUESTION" },
    ]);
  });

  it.each(["q2", "q3", "q4"])("reports %s, whose type cannot be compared", (questionId) => {
    expect(findEndRuleIssues([rule("a", questionId, "equals", "x")], questions)).toEqual([
      { ruleId: "a", questionId, reason: "UNSUPPORTED_QUESTION_TYPE" },
    ]);
  });

  it("reports every offending condition of every rule", () => {
    const rules = [rule("a", "gone", "gt", 1), rule("b", "q1", "gt", 1), rule("c", "q2", "gt", 1)];

    expect(findEndRuleIssues(rules, questions).map((i) => i.ruleId)).toEqual(["a", "c"]);
  });
});

describe("assertEndRulesValid", () => {
  it("throws FORM_INVALID_END_RULES with the issues", () => {
    expect.assertions(2);

    try {
      assertEndRulesValid([rule("a", "gone", "gt", 1)], []);
    } catch (error) {
      expect(error).toMatchObject({ message: ErrorCode.FORM_INVALID_END_RULES, statusCode: 400 });
      expect(error).toMatchObject({ errors: [{ ruleId: "a", reason: "UNKNOWN_QUESTION" }] });
    }
  });

  it("does nothing for valid rules", () => {
    expect(() =>
      assertEndRulesValid([rule("a", "q1", "gt", 1)], [{ id: "q1", type: "NPS" }]),
    ).not.toThrow();
  });
});

describe("resolveEndScreen", () => {
  const form = {
    endRules: [rule("high", "q1", "gt", 8, "Great!"), rule("mid", "q1", "gt", 5, "Fine")],
    endScreen: { text: "Thanks", redirectUrl: "https://example.com/default" },
    translations: { en: { endText: "Thanks (en)", endRules: { high: "Great (en)!" } } },
  };

  it("takes the first rule that holds, in order", () => {
    expect(resolveEndScreen(form, { q1: 9 }, ALL, null)).toEqual({
      endRuleId: "high",
      screen: { text: "Great!", redirectUrl: "https://example.com/high" },
    });
    expect(resolveEndScreen(form, { q1: 6 }, ALL, null).endRuleId).toBe("mid");
  });

  it("falls back to the form's own end screen when no rule holds", () => {
    expect(resolveEndScreen(form, { q1: 2 }, ALL, null)).toEqual({
      endRuleId: null,
      screen: { text: "Thanks", redirectUrl: "https://example.com/default" },
    });
  });

  it("falls back to nothing (the built-in message) without rules and screen", () => {
    expect(resolveEndScreen({}, { q1: 2 }, ALL, null)).toEqual({ endRuleId: null, screen: null });
    expect(resolveEndScreen({ endRules: [] }, {}, ALL, "en")).toEqual({
      endRuleId: null,
      screen: null,
    });
  });

  it("does not match a rule on a question that was not shown", () => {
    // Even though the answer would satisfy it: only answers of visible questions count.
    expect(resolveEndScreen(form, { q1: 9 }, new Set(["q2"]), null).endRuleId).toBeNull();
  });

  it("does not let 'not equals' hold for a hidden question", () => {
    const notEquals = { endRules: [rule("ne", "q1", "notEquals", "x")] };

    expect(resolveEndScreen(notEquals, {}, new Set(), null).endRuleId).toBeNull();
    expect(resolveEndScreen(notEquals, {}, ALL, null).endRuleId).toBe("ne");
  });

  it("combines the rules of a group with AND and OR", () => {
    const group = (logic: "AND" | "OR") =>
      ({
        endRules: [
          {
            id: "g",
            condition: {
              logic,
              rules: [
                { questionId: "q1", operator: "gt", value: 5 },
                { questionId: "q2", operator: "equals", value: "yes" },
              ],
            },
            screen: { text: "G" },
          },
        ],
      }) as { endRules: FormEndRule[] };

    expect(resolveEndScreen(group("AND"), { q1: 9, q2: "no" }, ALL, null).endRuleId).toBeNull();
    expect(resolveEndScreen(group("AND"), { q1: 9, q2: "yes" }, ALL, null).endRuleId).toBe("g");
    expect(resolveEndScreen(group("OR"), { q1: 9, q2: "no" }, ALL, null).endRuleId).toBe("g");
    // A hidden member of an OR group does not hold, the visible one still can.
    expect(resolveEndScreen(group("OR"), { q1: 9 }, new Set(["q1"]), null).endRuleId).toBe("g");
    expect(resolveEndScreen(group("AND"), { q1: 9 }, new Set(["q1"]), null).endRuleId).toBeNull();
  });

  it("returns the text in the respondent's language", () => {
    expect(resolveEndScreen(form, { q1: 9 }, ALL, "en").screen?.text).toBe("Great (en)!");
    expect(resolveEndScreen(form, { q1: 2 }, ALL, "en").screen?.text).toBe("Thanks (en)");
    // No translation for the rule "mid": the main-language text.
    expect(resolveEndScreen(form, { q1: 6 }, ALL, "en").screen?.text).toBe("Fine");
    expect(resolveEndScreen(form, { q1: 9 }, ALL, "de").screen?.text).toBe("Great!");
  });

  it("ignores a stored rule that is malformed instead of failing the submit", () => {
    const broken = { endRules: [{ id: "x", condition: 5, screen: 7 }, rule("ok", "q1", "gt", 1)] };

    expect(resolveEndScreen(broken, { q1: 3 }, ALL, null).endRuleId).toBe("ok");
    expect(resolveEndScreen({ endRules: "garbage" }, { q1: 3 }, ALL, null).endRuleId).toBeNull();
  });
});

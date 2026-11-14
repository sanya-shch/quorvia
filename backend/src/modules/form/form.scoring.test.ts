import { describe, expect, it } from "vitest";
import type { FormScoring } from "@quorvia/shared-types";
import {
  fillScorePlaceholders,
  scoreConditionAnswers,
  scoreSubmission,
  stripQuestionScoring,
  toScorable,
} from "./form.scoring.js";

const scoring: FormScoring = {
  enabled: true,
  categories: [
    { id: "low", label: "Beginner", min: 0, max: 5 },
    { id: "high", label: "Advanced", min: 5.01, max: 10 },
  ],
};

const questions = [
  {
    id: "q1",
    type: "CHOICE_SINGLE" as const,
    required: false,
    options: [
      { id: "a", text: "A", score: 6 },
      { id: "b", text: "B", score: 1 },
    ],
    config: null,
  },
  {
    id: "q2",
    type: "RATING" as const,
    required: false,
    options: null,
    config: { scoreMultiplier: 0.5 },
  },
];

describe("toScorable", () => {
  it("passes the engine what it reads and nothing else", () => {
    expect(toScorable({ ...questions[0]!, extra: "x" } as never)).toEqual({
      id: "q1",
      type: "CHOICE_SINGLE",
      required: false,
      options: questions[0]!.options,
      config: null,
    });
  });

  it("copes with stored Json of an unexpected shape", () => {
    expect(
      toScorable({ id: "q", type: "TEXT", options: "garbage", config: [1, 2], required: null }),
    ).toEqual({ id: "q", type: "TEXT", required: false, options: null, config: null });
  });
});

describe("scoreSubmission", () => {
  it("scores a form that has scoring on, from the visible questions only", () => {
    const form = { scoring, questions };

    expect(scoreSubmission(form, { q1: "a", q2: 4 }, new Set(["q1", "q2"]))).toMatchObject({
      score: 8,
      maxScore: 8.5,
      categoryId: "high",
    });
    expect(scoreSubmission(form, { q1: "a", q2: 4 }, new Set(["q1"]))).toMatchObject({
      score: 6,
      maxScore: 6,
    });
  });

  it.each([
    ["no scoring", undefined],
    ["scoring switched off", { ...scoring, enabled: false }],
    ["damaged scoring", "garbage"],
  ])("does not score with %s", (_label, stored) => {
    expect(
      scoreSubmission({ scoring: stored, questions }, { q1: "a" }, new Set(["q1"])),
    ).toBeNull();
  });
});

describe("scoreConditionAnswers", () => {
  const scored = (percent: number | null) =>
    ({ score: 5, maxScore: 10, percent, categoryId: null, scoring }) as never;

  it("gives $score and $percent", () => {
    expect(scoreConditionAnswers(scored(50))).toEqual({ $score: 5, $percent: 50 });
  });

  it("leaves $percent out when there is no maximum, so a rule on it does not hold", () => {
    expect(scoreConditionAnswers(scored(null))).toEqual({ $score: 5 });
  });
});

describe("fillScorePlaceholders", () => {
  const scored = {
    score: 12.5,
    maxScore: 20,
    percent: 62.5,
    categoryId: "high",
    scoring,
  };

  it("puts the result into the text", () => {
    expect(
      fillScorePlaceholders(
        "You scored {{score}} of {{maxScore}} ({{percent}}%): {{category}}.",
        scored,
        null,
        null,
      ),
    ).toBe("You scored 12.5 of 20 (62.5%): Advanced.");
  });

  it("allows spaces inside the braces and repeats", () => {
    expect(fillScorePlaceholders("{{ score }} / {{score}}", scored, null, null)).toBe(
      "12.5 / 12.5",
    );
  });

  it("formats numbers in the respondent's language", () => {
    expect(fillScorePlaceholders("{{score}}", scored, null, "uk")).toBe("12,5");
    expect(fillScorePlaceholders("{{score}}", scored, null, "en")).toBe("12.5");
    // Not grouped, at most 2 decimals.
    expect(fillScorePlaceholders("{{score}}", { ...scored, score: 12345.678 }, null, "en")).toBe(
      "12345.68",
    );
  });

  it("writes numbers in a separate locale when one is given", () => {
    // A respondent who sent no language reads the form in its main language.
    expect(fillScorePlaceholders("{{score}}", scored, null, null, "uk")).toBe("12,5");
    expect(fillScorePlaceholders("{{score}}", scored, null, "en", "uk")).toBe("12,5");
  });

  it("falls back for a language the runtime does not know", () => {
    expect(fillScorePlaceholders("{{score}}", scored, null, "zz-INVALID-@@")).toBe("12.5");
  });

  it("uses the translated label of the category", () => {
    const translations = { en: { scoreCategories: { high: "Expert" } } };

    expect(fillScorePlaceholders("{{category}}", scored, translations, "en")).toBe("Expert");
    expect(fillScorePlaceholders("{{category}}", scored, translations, "de")).toBe("Advanced");
  });

  it("leaves a placeholder with nothing to show empty", () => {
    expect(
      fillScorePlaceholders(
        "[{{percent}}][{{category}}]",
        { ...scored, percent: null, categoryId: null },
        null,
        null,
      ),
    ).toBe("[][]");
    expect(
      fillScorePlaceholders("[{{category}}]", { ...scored, categoryId: "deleted" }, null, null),
    ).toBe("[]");
  });

  it("leaves text without placeholders, and unknown ones, as they are", () => {
    expect(fillScorePlaceholders("Thanks! {{unknown}} {score}", scored, null, null)).toBe(
      "Thanks! {{unknown}} {score}",
    );
  });

  it("does not expand a placeholder that came from a label", () => {
    const tricky = {
      ...scored,
      scoring: { ...scoring, categories: [{ id: "high", label: "{{score}}!", min: 0, max: 99 }] },
    };

    expect(fillScorePlaceholders("{{category}}", tricky, null, null)).toBe("{{score}}!");
  });
});

describe("stripQuestionScoring", () => {
  it("removes the points of options and the points of answers from the config", () => {
    const stripped = stripQuestionScoring({
      options: [
        { id: "a", text: "A", score: 6, isOther: true },
        { id: "b", text: "B" },
      ],
      config: { displayVariant: "tabs", score: { true: 1, false: 0 }, scoreMultiplier: 2, min: 1 },
    });

    expect(stripped).toEqual({
      options: [
        { id: "a", text: "A", isOther: true },
        { id: "b", text: "B" },
      ],
      config: { displayVariant: "tabs", min: 1 },
    });
    expect(JSON.stringify(stripped)).not.toMatch(/score/i);
  });

  it("keeps other fields and does not change its input", () => {
    const question = {
      id: "q",
      text: "T",
      options: [{ id: "a", score: 1 }],
      config: { x: 1, score: 2 },
    };
    const before = JSON.stringify(question);

    expect(stripQuestionScoring(question)).toMatchObject({ id: "q", text: "T" });
    expect(JSON.stringify(question)).toBe(before);
  });

  it("copes with questions that have no options or config, or odd ones", () => {
    expect(stripQuestionScoring({ options: null, config: null })).toEqual({
      options: null,
      config: null,
    });
    expect(stripQuestionScoring({})).toEqual({});
    expect(stripQuestionScoring({ options: [null, 5, "x"], config: [1] })).toEqual({
      options: [null, 5, "x"],
      config: [1],
    });
  });
});

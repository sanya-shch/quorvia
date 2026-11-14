import { describe, expect, it } from "vitest";
import type { FormScoring } from "@quorvia/shared-types";
import { categoryFor, computeScore, type ScorableQuestion } from "./index.js";

const choice = (
  id: string,
  scores: Record<string, number | null | undefined>,
  overrides: Partial<ScorableQuestion> = {},
): ScorableQuestion => ({
  id,
  type: "CHOICE_SINGLE",
  options: Object.entries(scores).map(([optionId, score]) => ({ id: optionId, score })),
  ...overrides,
});

const multi = (id: string, scores: Record<string, number>, overrides = {}): ScorableQuestion =>
  choice(id, scores, { type: "CHOICE_MULTI", ...overrides });

const rating = (id: string, multiplier: number | null, overrides = {}): ScorableQuestion => ({
  id,
  type: "RATING",
  config: { scoreMultiplier: multiplier },
  ...overrides,
});

describe("single choice", () => {
  const q = choice("q", { a: 3, b: 1, c: 0 });

  it("gives the points of the picked option, and the best one as the maximum", () => {
    expect(computeScore([q], { q: "a" })).toMatchObject({ score: 3, maxScore: 3, percent: 100 });
    expect(computeScore([q], { q: "b" })).toMatchObject({ score: 1, maxScore: 3, percent: 33.33 });
  });

  it("gives nothing for an unanswered question, an unknown option or a wrong shape", () => {
    for (const answer of [undefined, null, "nope", 5, ["a"], {}]) {
      expect(computeScore([q], { q: answer }).score).toBe(0);
    }
  });

  it("treats an option without points as worth 0", () => {
    expect(computeScore([choice("q", { a: undefined, b: null, c: 2 })], { q: "a" }).score).toBe(0);
  });

  it("works for an image choice the same way", () => {
    expect(
      computeScore([choice("q", { a: 4 }, { type: "IMAGE_CHOICE" })], { q: "a" }),
    ).toMatchObject({ score: 4, maxScore: 4 });
  });

  it("an optional question is worth at least 0, a required one its best option even if negative", () => {
    const negative = { a: -2, b: -5 };

    expect(computeScore([choice("q", negative)], {}).maxScore).toBe(0);
    expect(computeScore([choice("q", negative, { required: true })], { q: "a" })).toMatchObject({
      score: -2,
      maxScore: -2,
    });
  });
});

describe("multiple choice", () => {
  const q = multi("q", { a: 2, b: 3, c: -1 });

  it("adds up the picked options; the maximum is every option that gives points", () => {
    expect(computeScore([q], { q: ["a", "b"] })).toMatchObject({ score: 5, maxScore: 5 });
    expect(computeScore([q], { q: ["a", "c"] })).toMatchObject({ score: 1, maxScore: 5 });
    expect(computeScore([q], { q: ["c"] }).score).toBe(-1);
  });

  it("counts an option once even if the answer repeats it, and ignores unknown ones", () => {
    expect(computeScore([q], { q: ["a", "a", "zzz"] }).score).toBe(2);
  });

  it("gives nothing for a wrong shape", () => {
    for (const answer of [undefined, "a", 5, {}]) {
      expect(computeScore([q], { q: answer }).score).toBe(0);
    }
  });

  it("a required question with no positive option has its least bad one as the maximum", () => {
    expect(computeScore([multi("q", { a: -3, b: -1 }, { required: true })], {}).maxScore).toBe(-1);
    expect(computeScore([multi("q", { a: -3, b: -1 })], {}).maxScore).toBe(0);
  });
});

describe("yes / no", () => {
  const q: ScorableQuestion = {
    id: "q",
    type: "BOOLEAN",
    config: { score: { true: 5, false: 1 } },
  };

  it("scores the answer and takes the better one as the maximum", () => {
    expect(computeScore([q], { q: true })).toMatchObject({ score: 5, maxScore: 5 });
    expect(computeScore([q], { q: false })).toMatchObject({ score: 1, maxScore: 5 });
    expect(computeScore([q], {}).score).toBe(0);
    expect(computeScore([q], { q: "true" }).score).toBe(0);
  });

  it("is worth nothing without points configured", () => {
    expect(computeScore([{ id: "q", type: "BOOLEAN" }], { q: true })).toMatchObject({
      score: 0,
      maxScore: 0,
      percent: null,
    });
  });
});

describe("numbers times a factor", () => {
  it("scores a rating: the value times the factor, the best rating times it as the maximum", () => {
    // RATING defaults to 1..5.
    expect(computeScore([rating("q", 2)], { q: 4 })).toMatchObject({ score: 8, maxScore: 10 });
    expect(computeScore([rating("q", 0.5)], { q: 3 })).toMatchObject({ score: 1.5, maxScore: 2.5 });
  });

  it("uses the configured scale bounds", () => {
    const scale: ScorableQuestion = {
      id: "q",
      type: "SCALE",
      config: { min: 0, max: 10, scoreMultiplier: 3 },
    };

    expect(computeScore([scale], { q: 7 })).toMatchObject({ score: 21, maxScore: 30 });
  });

  it("scores an NPS question on 0..10", () => {
    expect(
      computeScore([{ id: "q", type: "NPS", config: { scoreMultiplier: 1 } }], { q: 9 }),
    ).toMatchObject({ score: 9, maxScore: 10 });
  });

  it("scores a NUMBER, but only knows its maximum when both bounds are set", () => {
    const bounded: ScorableQuestion = {
      id: "q",
      type: "NUMBER",
      config: { min: 0, max: 100, scoreMultiplier: 0.1 },
    };
    const unbounded: ScorableQuestion = {
      id: "q",
      type: "NUMBER",
      config: { scoreMultiplier: 0.1 },
    };

    expect(computeScore([bounded], { q: 40 })).toMatchObject({ score: 4, maxScore: 10 });
    expect(computeScore([unbounded], { q: 40 })).toMatchObject({
      score: 4,
      maxScore: 0,
      percent: null,
    });
  });

  it("a negative factor makes the lowest value the best one", () => {
    expect(computeScore([rating("q", -1, { required: true })], { q: 2 })).toMatchObject({
      score: -2,
      maxScore: -1,
    });
  });

  it("gives nothing without a factor, with a zero factor, or for an answer that is not a number", () => {
    expect(computeScore([rating("q", null)], { q: 4 })).toMatchObject({ score: 0, maxScore: 0 });
    expect(computeScore([rating("q", 0)], { q: 4 }).score).toBe(0);

    for (const answer of ["4", null, undefined, NaN, Infinity, [4]]) {
      expect(computeScore([rating("q", 2)], { q: answer }).score).toBe(0);
    }
  });

  it("rounds to hundredths, half away from zero", () => {
    const q = (id: string): ScorableQuestion => ({
      id,
      type: "NUMBER",
      config: { min: 0, max: 100, scoreMultiplier: 0.01 },
    });

    expect(computeScore([q("q")], { q: 0.5 }).score).toBe(0.01);
    expect(computeScore([q("q")], { q: -0.5 }).score).toBe(-0.01);
    expect(computeScore([q("q")], { q: 0.4 }).score).toBe(0);
  });
});

describe("exact sums", () => {
  it("does not drift the way floating point does", () => {
    const qs = [choice("a", { x: 0.1 }), choice("b", { x: 0.2 })];
    const result = computeScore(qs, { a: "x", b: "x" });

    expect(result.score).toBe(0.3);
    expect(result.maxScore).toBe(0.3);
    expect(
      computeScore(
        [0.1, 0.7, 0.2, 0.3].map((v, i) => choice(`q${i}`, { x: v })),
        {
          q0: "x",
          q1: "x",
          q2: "x",
          q3: "x",
        },
      ).score,
    ).toBe(1.3);
  });
});

describe("what counts", () => {
  const questions = [
    choice("a", { x: 5 }),
    choice("b", { x: 5 }),
    { id: "t", type: "TEXT" } as ScorableQuestion,
    { id: "d", type: "DATE" } as ScorableQuestion,
    { id: "r", type: "RANKING", options: [{ id: "o", score: 9 }] } as ScorableQuestion,
    { id: "m", type: "MATRIX", options: [{ id: "o", score: 9 }] } as ScorableQuestion,
    { id: "f", type: "FILE" } as ScorableQuestion,
  ];
  const answers = {
    a: "x",
    b: "x",
    t: "hello",
    d: "2026-01-01",
    r: ["o"],
    m: { o: "o" },
    f: ["id"],
  };

  it("only choice, yes/no and number questions give points", () => {
    expect(computeScore(questions, answers)).toMatchObject({ score: 10, maxScore: 10 });
  });

  it("only questions the respondent was shown count, in the total and in the maximum", () => {
    expect(computeScore(questions, answers, new Set(["a", "t"]))).toMatchObject({
      score: 5,
      maxScore: 5,
      percent: 100,
    });
    expect(computeScore(questions, answers, new Set())).toMatchObject({
      score: 0,
      maxScore: 0,
      percent: null,
    });
  });

  it("without a visibility list every question counts", () => {
    expect(computeScore(questions, answers, null).score).toBe(10);
    expect(computeScore(questions, answers, undefined).score).toBe(10);
  });

  it("an answer to a hidden question is not counted", () => {
    expect(computeScore(questions, answers, new Set(["a"])).score).toBe(5);
  });

  it("copes with no questions and no answers", () => {
    expect(computeScore([], {})).toEqual({
      score: 0,
      maxScore: 0,
      percent: null,
      categoryId: null,
    });
  });

  it("does not change its input", () => {
    const before = JSON.stringify([questions, answers]);

    computeScore(questions, answers, new Set(["a"]));

    expect(JSON.stringify([questions, answers])).toBe(before);
  });
});

describe("categories", () => {
  const scoring: FormScoring = {
    enabled: true,
    categories: [
      { id: "low", label: "Beginner", min: 0, max: 30 },
      { id: "mid", label: "Intermediate", min: 30.01, max: 70 },
      { id: "high", label: "Advanced", min: 70.01, max: 100 },
    ],
  };

  it("finds the range the total falls into, both ends included", () => {
    expect(categoryFor(scoring, 0)).toBe("low");
    expect(categoryFor(scoring, 30)).toBe("low");
    expect(categoryFor(scoring, 30.01)).toBe("mid");
    expect(categoryFor(scoring, 70)).toBe("mid");
    expect(categoryFor(scoring, 100)).toBe("high");
  });

  it("finds none outside every range, without scoring or with scoring switched off", () => {
    expect(categoryFor(scoring, -1)).toBeNull();
    expect(categoryFor(scoring, 101)).toBeNull();
    expect(categoryFor(null, 10)).toBeNull();
    expect(categoryFor(undefined, 10)).toBeNull();
    expect(categoryFor({ ...scoring, enabled: false }, 10)).toBeNull();
  });

  it("is part of the result when scoring is given", () => {
    const qs = [choice("a", { x: 50 })];

    expect(computeScore(qs, { a: "x" }, null, scoring)).toMatchObject({
      score: 50,
      categoryId: "mid",
    });
    expect(computeScore(qs, { a: "x" })).toMatchObject({ score: 50, categoryId: null });
  });
});

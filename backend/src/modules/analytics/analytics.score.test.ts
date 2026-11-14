import { describe, expect, it } from "vitest";
import { createScoreAccumulator, toResponseScore } from "./analytics.score.js";

const scoring = {
  enabled: true,
  categories: [
    { id: "low", label: "Початківець", min: 0, max: 10 },
    { id: "high", label: "Експерт", min: 11, max: 100 },
  ],
};

const row = (
  score: number | null,
  maxScore: number | null,
  scoreCategoryId: string | null = null,
) => ({
  score,
  maxScore,
  scoreCategoryId,
});

describe("createScoreAccumulator", () => {
  it("is null for a form that never scored", () => {
    const acc = createScoreAccumulator();

    acc.add(row(null, null));

    expect(acc.result(null)).toBeNull();
    expect(acc.result({ enabled: false, categories: [] })).toBeNull();
  });

  it("is an empty result for a form that scores but has no scored responses yet", () => {
    expect(createScoreAccumulator().result(scoring)).toMatchObject({
      enabled: true,
      scoredCount: 0,
      average: 0,
      min: 0,
      max: 0,
      averagePercent: null,
      uncategorizedCount: 0,
      categories: [
        { id: "low", count: 0 },
        { id: "high", count: 0 },
      ],
    });
  });

  it("still shows what was scored after scoring is switched off", () => {
    const acc = createScoreAccumulator();

    acc.add(row(5, 10, "low"));

    expect(acc.result({ ...scoring, enabled: false })).toMatchObject({
      enabled: false,
      scoredCount: 1,
    });
  });

  it("averages, takes the extremes and counts the categories", () => {
    const acc = createScoreAccumulator();

    acc.add(row(5, 10, "low"));
    acc.add(row(15, 20, "high"));
    acc.add(row(16, 20, "high"));
    acc.add(row(null, null));

    expect(acc.result(scoring)).toMatchObject({
      scoredCount: 3,
      average: 12,
      min: 5,
      max: 16,
      averagePercent: 68.33,
      categories: [
        { id: "low", label: "Початківець", min: 0, max: 10, count: 1 },
        { id: "high", label: "Експерт", min: 11, max: 100, count: 2 },
      ],
      uncategorizedCount: 0,
    });
  });

  it("puts percent of the maximum in ten buckets, 100 in the last one", () => {
    const acc = createScoreAccumulator();

    for (const [score, max] of [
      [0, 10],
      [1, 10],
      [5, 10],
      [9.9, 10],
      [10, 10],
      [-3, 10],
      [12, 10],
    ] as const) {
      acc.add(row(score, max));
    }

    const counts = acc.result(scoring)!.histogram.map((b) => b.count);

    // 0% and -30% -> bucket 0; 10% -> 1; 50% -> 5; 99% -> 9; 100% and 120% -> 9.
    expect(counts).toEqual([2, 1, 0, 0, 0, 1, 0, 0, 0, 3]);
    expect(acc.result(scoring)!.histogram[0]).toEqual({ fromPercent: 0, toPercent: 10, count: 2 });
    expect(acc.result(scoring)!.histogram[9]).toEqual({
      fromPercent: 90,
      toPercent: 100,
      count: 3,
    });
  });

  it("leaves a response without a positive maximum out of the percentages, not out of the totals", () => {
    const acc = createScoreAccumulator();

    acc.add(row(4, 0));
    acc.add(row(6, null));
    acc.add(row(5, 10));

    const result = acc.result(scoring)!;

    expect(result.scoredCount).toBe(3);
    expect(result.average).toBe(5);
    expect(result.averagePercent).toBe(50);
    expect(result.histogram.reduce((n, b) => n + b.count, 0)).toBe(1);
  });

  it("counts responses in no category, and in a category that was deleted since", () => {
    const acc = createScoreAccumulator();

    acc.add(row(50, 100, null));
    acc.add(row(5, 10, "deleted"));
    acc.add(row(5, 10, "low"));

    expect(acc.result(scoring)).toMatchObject({
      uncategorizedCount: 2,
      categories: [
        { id: "low", count: 1 },
        { id: "high", count: 0 },
      ],
    });
  });

  it("uses the labels as they are now", () => {
    const acc = createScoreAccumulator();

    acc.add(row(5, 10, "low"));

    expect(
      acc.result({ enabled: true, categories: [{ id: "low", label: "Новачок", min: 0, max: 10 }] })!
        .categories[0]!.label,
    ).toBe("Новачок");
  });

  it("rounds to 2 decimals and copes with a damaged settings value", () => {
    const acc = createScoreAccumulator();

    acc.add(row(1, 3));
    acc.add(row(1, 3));
    acc.add(row(2, 3));

    expect(acc.result("garbage")).toMatchObject({
      enabled: false,
      average: 1.33,
      averagePercent: 44.44,
      categories: [],
    });
  });
});

describe("toResponseScore", () => {
  it("gives the totals, the percentage and the category by name", () => {
    expect(toResponseScore(row(15, 20, "high"), scoring)).toEqual({
      score: 15,
      maxScore: 20,
      percent: 75,
      categoryId: "high",
      categoryLabel: "Експерт",
    });
  });

  it("is null for a response that was not scored", () => {
    expect(toResponseScore(row(null, null), scoring)).toBeNull();
  });

  it("has no percentage without a positive maximum, and no label for a deleted category", () => {
    expect(toResponseScore(row(3, 0, "gone"), scoring)).toEqual({
      score: 3,
      maxScore: 0,
      percent: null,
      categoryId: "gone",
      categoryLabel: null,
    });
    expect(toResponseScore(row(3, null), scoring)?.percent).toBeNull();
  });

  it("keeps a score of 0 (it is a score, not 'no score')", () => {
    expect(toResponseScore(row(0, 10), scoring)?.score).toBe(0);
  });
});

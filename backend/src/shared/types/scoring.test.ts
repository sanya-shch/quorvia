import { describe, expect, it } from "vitest";
import { SCORE_LIMITS, isScoreBound, isScoreValue, normalizeScoring } from "@quorvia/shared-types";

const category = (id: string, min: number, max: number, label = id) => ({ id, label, min, max });

describe("isScoreValue", () => {
  it.each([0, 1, -1, 2.5, 0.01, -0.99, 1000, -1000])("accepts %s", (value) => {
    expect(isScoreValue(value)).toBe(true);
  });

  it.each([1001, -1001, 0.001, 1.005, NaN, Infinity, "1", null, undefined, true, [1]])(
    "rejects %j",
    (value) => {
      expect(isScoreValue(value)).toBe(false);
    },
  );
});

describe("isScoreBound", () => {
  it("allows the large totals a whole form can reach, with at most 2 decimals", () => {
    expect(isScoreBound(250_000)).toBe(true);
    expect(isScoreBound(-0.5)).toBe(true);
    expect(isScoreBound(SCORE_LIMITS.categoryBound.max + 1)).toBe(false);
    expect(isScoreBound(1.234)).toBe(false);
  });
});

describe("normalizeScoring", () => {
  it("keeps valid scoring as it is, in order", () => {
    const scoring = {
      enabled: true,
      categories: [category("a", 0, 30), category("b", 31, 70), category("c", 71, 100)],
    };

    expect(normalizeScoring(scoring)).toEqual(scoring);
  });

  it.each([null, undefined, "x", 5, [], true])("returns null for %j", (raw) => {
    expect(normalizeScoring(raw)).toBeNull();
  });

  it("returns null when scoring is off and there is nothing to keep", () => {
    expect(normalizeScoring({ enabled: false })).toBeNull();
    expect(normalizeScoring({ enabled: false, categories: [] })).toBeNull();
    expect(normalizeScoring({})).toBeNull();
  });

  it("keeps the categories of switched-off scoring, so they survive a toggle", () => {
    expect(normalizeScoring({ enabled: false, categories: [category("a", 0, 10)] })).toEqual({
      enabled: false,
      categories: [category("a", 0, 10)],
    });
  });

  it("is enabled only by a real true", () => {
    expect(normalizeScoring({ enabled: "true", categories: [category("a", 0, 1)] })?.enabled).toBe(
      false,
    );
    expect(normalizeScoring({ enabled: true })).toEqual({ enabled: true, categories: [] });
  });

  it("drops a category that is malformed", () => {
    const result = normalizeScoring({
      enabled: true,
      categories: [
        category("", 0, 1),
        category("ok", 0, 1),
        { id: "nolabel", label: "  ", min: 2, max: 3 },
        { id: "nomin", label: "x", max: 3 },
        { id: "str", label: "x", min: "2", max: 3 },
        { id: "decimals", label: "x", min: 2.345, max: 3 },
        category("inverted", 9, 4),
        null,
        "x",
      ],
    });

    expect(result?.categories.map((c) => c.id)).toEqual(["ok"]);
  });

  it("drops a category that repeats an id or overlaps one before it, keeping the first", () => {
    const result = normalizeScoring({
      enabled: true,
      categories: [
        category("a", 0, 10),
        category("a", 20, 30),
        category("overlap", 10, 15),
        category("inside", 2, 3),
        category("around", -5, 50),
        category("b", 11, 20),
      ],
    });

    expect(result?.categories.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("trims the label and rejects a long one", () => {
    expect(
      normalizeScoring({ enabled: true, categories: [category("a", 0, 1, "  Hi  ")] })
        ?.categories[0]?.label,
    ).toBe("Hi");
    expect(
      normalizeScoring({
        enabled: true,
        categories: [category("a", 0, 1, "x".repeat(SCORE_LIMITS.categoryLabel + 1))],
      })?.categories,
    ).toEqual([]);
  });

  it("drops categories beyond the limit", () => {
    const many = Array.from({ length: SCORE_LIMITS.categories + 3 }, (_, i) =>
      category(`c${i}`, i * 10, i * 10 + 5),
    );

    expect(normalizeScoring({ enabled: true, categories: many })?.categories).toHaveLength(
      SCORE_LIMITS.categories,
    );
  });

  it("strips unknown fields", () => {
    expect(
      normalizeScoring({
        enabled: true,
        extra: 1,
        categories: [{ ...category("a", 0, 1), extra: true }],
      }),
    ).toEqual({ enabled: true, categories: [category("a", 0, 1)] });
  });
});

import { describe, expect, it } from "vitest";
import { SCORE_LIMITS } from "@quorvia/shared-types";
import type { Question, ScoringDraft } from "../../types/formBuilder";
import {
  canAddCategory,
  draftFromScoring,
  findCategoryIssues,
  hasBlockingCategoryIssue,
  isScorableType,
  numberNeedsRange,
  parseNumber,
  parseScoreValue,
  prepareScoring,
  scoreToText,
  withOptionScore,
} from "./scoring";

const category = (id: string, min: string, max: string, label = id) => ({ id, label, min, max });
const draft = (...categories: ScoringDraft["categories"]): ScoringDraft => ({
  enabled: true,
  categories,
});

describe("parseNumber", () => {
  it.each([
    ["5", 5],
    [" -2.5 ", -2.5],
    // Half-typed numbers that are already a number: the field keeps its text, the value is 1.
    ["1.", 1],
    ["0,5", 0.5],
    ["0", 0],
  ])("reads %j as %s", (text, value) => {
    expect(parseNumber(text)).toBe(value);
  });

  it.each(["", "  ", "-", "abc", "1e", "Infinity", "NaN"])("rejects %j", (text) => {
    expect(parseNumber(text)).toBeNull();
  });
});

describe("parseScoreValue", () => {
  it("reads valid points, and an empty field as none", () => {
    expect(parseScoreValue("3")).toBe(3);
    expect(parseScoreValue("-1000")).toBe(-1000);
    expect(parseScoreValue("0,25")).toBe(0.25);
    expect(parseScoreValue("")).toBeNull();
    expect(parseScoreValue("  ")).toBeNull();
  });

  it.each(["1000001", "-1000001", "1.234", "abc", "-"])("marks %j as not usable", (text) => {
    expect(parseScoreValue(text)).toBeUndefined();
  });

  it("round-trips through the text of the field", () => {
    expect(scoreToText(2.5)).toBe("2.5");
    expect(scoreToText(0)).toBe("0");
    expect(scoreToText(null)).toBe("");
    expect(scoreToText(undefined)).toBe("");
  });
});

describe("categories of a draft", () => {
  it("come from the server's settings as text", () => {
    expect(
      draftFromScoring({ enabled: true, categories: [{ id: "a", label: "A", min: 0, max: 10.5 }] }),
    ).toEqual({ enabled: true, categories: [category("a", "0", "10.5", "A")] });
    expect(draftFromScoring(null)).toBeNull();
  });

  it("have no issues when they are fine", () => {
    expect(findCategoryIssues(draft(category("a", "0", "10"), category("b", "11", "20")))).toEqual(
      {},
    );
    expect(findCategoryIssues(null)).toEqual({});
  });

  it("flag unfinished ones as incomplete, which does not block saving", () => {
    const d = draft(
      category("a", "", "10"),
      category("b", "0", "x"),
      category("c", "0", "5", "  "),
      category("d", "0", "1.234"),
    );

    expect(findCategoryIssues(d)).toEqual({
      0: "incomplete",
      1: "incomplete",
      2: "incomplete",
      3: "incomplete",
    });
    expect(hasBlockingCategoryIssue(d)).toBe(false);
  });

  it("flag a range that runs backwards, and one that overlaps an earlier one: both block saving", () => {
    const d = draft(category("a", "0", "10"), category("b", "5", "15"), category("c", "9", "2"));

    expect(findCategoryIssues(d)).toEqual({ 1: "overlap", 2: "inverted" });
    expect(hasBlockingCategoryIssue(d)).toBe(true);
  });

  it("treat touching ends as an overlap (both ends are included)", () => {
    expect(findCategoryIssues(draft(category("a", "0", "10"), category("b", "10", "20")))).toEqual({
      1: "overlap",
    });
  });

  it("do not count an unfinished category when looking for overlaps", () => {
    expect(findCategoryIssues(draft(category("a", "", ""), category("b", "0", "10")))).toEqual({
      0: "incomplete",
    });
  });

  it("allow at most the limit", () => {
    const many = draft(
      ...Array.from({ length: SCORE_LIMITS.categories }, (_, i) =>
        category(`c${i}`, String(i * 10), String(i * 10 + 5)),
      ),
    );

    expect(canAddCategory(many)).toBe(false);
    expect(canAddCategory(draft())).toBe(true);
    expect(canAddCategory(null)).toBe(true);
  });
});

describe("prepareScoring", () => {
  it("sends the finished categories as numbers, in order", () => {
    expect(
      prepareScoring(draft(category("a", "0", "10", " Beginner "), category("b", "10,5", "20"))),
    ).toEqual({
      enabled: true,
      categories: [
        { id: "a", label: "Beginner", min: 0, max: 10 },
        { id: "b", label: "b", min: 10.5, max: 20 },
      ],
    });
  });

  it("leaves out unfinished, backwards and overlapping categories", () => {
    const result = prepareScoring(
      draft(
        category("a", "0", "10"),
        category("x", "", "5"),
        category("o", "5", "15"),
        category("i", "9", "2"),
        category("b", "11", "20"),
      ),
    );

    expect(result?.categories.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("keeps the categories of scoring that is switched off, and drops settings with nothing in them", () => {
    expect(prepareScoring({ enabled: false, categories: [category("a", "0", "1")] })?.enabled).toBe(
      false,
    );
    expect(prepareScoring({ enabled: false, categories: [] })).toBeNull();
    expect(prepareScoring(null)).toBeNull();
    expect(prepareScoring(undefined)).toBeNull();
    expect(prepareScoring({ enabled: true, categories: [] })).toEqual({
      enabled: true,
      categories: [],
    });
  });
});

const question = (overrides: Partial<Question> = {}): Question => ({
  id: "q",
  text: "Q",
  type: "NUMBER",
  required: false,
  order: 0,
  options: [],
  config: null,
  ...overrides,
});

describe("the points of answers", () => {
  it("only some question types can give points", () => {
    for (const type of [
      "CHOICE_SINGLE",
      "CHOICE_MULTI",
      "IMAGE_CHOICE",
      "BOOLEAN",
      "NUMBER",
      "RATING",
      "SCALE",
      "NPS",
    ] as const) {
      expect(isScorableType(type)).toBe(true);
    }
    for (const type of ["TEXT", "DATE", "RANKING", "MATRIX", "FILE"] as const) {
      expect(isScorableType(type)).toBe(false);
    }
  });

  it("sets and clears the points of one option, leaving the others alone", () => {
    const options = [
      { id: "a", text: "A", isDefault: false, score: 1 },
      { id: "b", text: "B", isDefault: false },
    ];

    expect(withOptionScore(options, "b", 3)).toEqual([
      { id: "a", text: "A", isDefault: false, score: 1 },
      { id: "b", text: "B", isDefault: false, score: 3 },
    ]);
    expect(withOptionScore(options, "a", null)).toEqual([
      { id: "a", text: "A", isDefault: false },
      { id: "b", text: "B", isDefault: false },
    ]);
    expect(withOptionScore(options, "a", 0)[0]).toEqual({
      id: "a",
      text: "A",
      isDefault: false,
      score: 0,
    });
    expect(options[0]).toEqual({ id: "a", text: "A", isDefault: false, score: 1 });
  });

  it("a number with a multiplier needs both ends of a range", () => {
    expect(numberNeedsRange(question({ config: { scoreMultiplier: 2 } }))).toBe(true);
    expect(numberNeedsRange(question({ config: { scoreMultiplier: 2, min: 0 } }))).toBe(true);
    expect(numberNeedsRange(question({ config: { scoreMultiplier: 2, min: 5, max: 1 } }))).toBe(
      true,
    );
    expect(numberNeedsRange(question({ config: { scoreMultiplier: 2, min: 0, max: 10 } }))).toBe(
      false,
    );
    expect(numberNeedsRange(question({ config: { scoreMultiplier: 0 } }))).toBe(false);
    expect(numberNeedsRange(question({ config: null }))).toBe(false);
    // Other types always have a range of their own.
    expect(numberNeedsRange(question({ type: "RATING", config: { scoreMultiplier: 2 } }))).toBe(
      false,
    );
  });
});

import { describe, expect, it } from "vitest";
import { QUOTA_LIMITS, type FormQuota } from "@quorvia/shared-types";
import type { Question } from "../../types/formBuilder";
import {
  draftChanges,
  draftFromQuota,
  draftToInput,
  findBrokenQuotas,
  isDraftChanged,
  isDraftComplete,
  newQuotaDraft,
  parseLimit,
  quotaProgress,
} from "./quotas";

const question = (overrides: Partial<Question> = {}): Question => ({
  id: "q1",
  text: "Місто",
  type: "NUMBER",
  required: false,
  order: 0,
  options: [],
  config: null,
  ...overrides,
});

const quota = (overrides: Partial<FormQuota> = {}): FormQuota => ({
  id: "a",
  name: "Київ",
  condition: { logic: "AND", rules: [{ questionId: "q1", operator: "gt", value: 5 }] },
  limit: 50,
  count: 10,
  message: null,
  ...overrides,
});

describe("parseLimit", () => {
  it.each([
    ["50", 50],
    [" 7 ", 7],
    [String(QUOTA_LIMITS.limit.max), QUOTA_LIMITS.limit.max],
  ])("reads %j as %i", (text, value) => {
    expect(parseLimit(text)).toBe(value);
  });

  it.each(["", "0", "-3", "1.5", "abc", "1e3", String(QUOTA_LIMITS.limit.max + 1)])(
    "rejects %j",
    (text) => {
      expect(parseLimit(text)).toBeNull();
    },
  );
});

describe("newQuotaDraft", () => {
  it("starts on the first usable question, with nothing filled in", () => {
    const draft = newQuotaDraft([question({ id: "r", type: "RANKING" }), question()]);

    expect(draft).toMatchObject({
      id: null,
      name: "",
      limit: "",
      message: "",
      condition: { logic: "AND", rules: [{ questionId: "q1", value: "" }] },
    });
  });

  it("is null when no question can be used", () => {
    expect(newQuotaDraft([])).toBeNull();
    expect(newQuotaDraft([question({ type: "FILE" })])).toBeNull();
    expect(newQuotaDraft([question({ id: undefined })])).toBeNull();
  });
});

describe("a draft", () => {
  it("is complete with a name, a valid limit and a value in every condition", () => {
    expect(isDraftComplete(draftFromQuota(quota()))).toBe(true);
  });

  it.each([
    ["no name", { name: "  " }],
    ["no limit", { limit: "" }],
    ["a zero limit", { limit: "0" }],
    [
      "an empty condition value",
      { condition: { logic: "AND", rules: [{ questionId: "q1", operator: "gt", value: "" }] } },
    ],
  ] as const)("is not complete with %s", (_label, change) => {
    expect(isDraftComplete({ ...draftFromQuota(quota()), ...change } as never)).toBe(false);
    expect(draftToInput({ ...draftFromQuota(quota()), ...change } as never)).toBeNull();
  });

  it("becomes the input the server expects, trimmed, with an empty message as null", () => {
    expect(
      draftToInput({ ...draftFromQuota(quota()), name: "  Київ ", limit: " 60 ", message: "  " }),
    ).toEqual({
      name: "Київ",
      limit: 60,
      message: null,
      condition: quota().condition,
    });
    expect(draftToInput({ ...draftFromQuota(quota()), message: " Повно " })?.message).toBe("Повно");
  });

  it("differs from the server's quota only when something changed", () => {
    const base = draftFromQuota(quota());

    expect(isDraftChanged(base, quota())).toBe(false);
    expect(isDraftChanged({ ...base, name: "Львів" }, quota())).toBe(true);
    expect(isDraftChanged({ ...base, limit: "51" }, quota())).toBe(true);
    expect(isDraftChanged({ ...base, message: "x" }, quota())).toBe(true);
    expect(
      isDraftChanged(
        { ...base, condition: { logic: "OR", rules: quota().condition.rules } },
        quota(),
      ),
    ).toBe(true);
    // Spaces around the name do not make it a change.
    expect(isDraftChanged({ ...base, name: " Київ " }, quota())).toBe(false);
    // A draft that was never saved is always a change.
    expect(isDraftChanged(newQuotaDraft([question()])!, null)).toBe(true);
  });

  it("sends only what changed: an unchanged condition is not sent, so nothing is counted again", () => {
    const base = draftFromQuota(quota());

    expect(draftChanges({ ...base, name: "Львів" }, quota())).toEqual({ name: "Львів" });
    expect(draftChanges({ ...base, limit: "99" }, quota())).toEqual({ limit: 99 });
    expect(draftChanges({ ...base, message: "Повно" }, quota())).toEqual({ message: "Повно" });
    expect(draftChanges({ ...base, message: "" }, quota({ message: "Повно" }))).toEqual({
      message: null,
    });

    const condition = {
      logic: "AND" as const,
      rules: [{ questionId: "q1", operator: "lt" as const, value: 2 }],
    };

    expect(draftChanges({ ...base, condition }, quota())).toEqual({ condition });
    expect(draftChanges(base, quota())).toEqual({});
    expect(draftChanges({ ...base, name: "" }, quota())).toBeNull();
  });
});

describe("quotaProgress", () => {
  it("gives the percentage and whether the quota is full", () => {
    expect(quotaProgress({ count: 10, limit: 50 })).toEqual({
      percent: 20,
      full: false,
      over: false,
    });
    expect(quotaProgress({ count: 0, limit: 50 })).toEqual({
      percent: 0,
      full: false,
      over: false,
    });
    expect(quotaProgress({ count: 50, limit: 50 })).toEqual({
      percent: 100,
      full: true,
      over: false,
    });
  });

  it("caps the bar at 100% when the limit was lowered below the count", () => {
    expect(quotaProgress({ count: 80, limit: 50 })).toEqual({
      percent: 100,
      full: true,
      over: true,
    });
  });
});

describe("findBrokenQuotas", () => {
  it("lists the quotas that look at a deleted question or one that cannot be used", () => {
    const quotas = [
      quota({ id: "ok" }),
      quota({
        id: "gone",
        condition: { logic: "AND", rules: [{ questionId: "x", operator: "gt", value: 1 }] },
      }),
      quota({
        id: "rank",
        condition: { logic: "AND", rules: [{ questionId: "q2", operator: "gt", value: 1 }] },
      }),
    ];
    const questions = [question(), question({ id: "q2", type: "RANKING" })];

    expect(findBrokenQuotas(quotas, questions)).toEqual(["gone", "rank"]);
    expect(findBrokenQuotas([], questions)).toEqual([]);
  });
});

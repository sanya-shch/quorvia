import { describe, expect, it, vi } from "vitest";
import { ErrorCode, QUOTA_LIMITS } from "@quorvia/shared-types";
import {
  assertQuotaCapacity,
  assertQuotasOpen,
  assertQuotasValid,
  claimQuotaPlaces,
  findQuotaIssues,
  fullMatchingQuota,
  matchingQuotas,
  toQuota,
  type StoredQuota,
} from "./form.quotas.js";

const quota = (
  id: string,
  condition: unknown,
  overrides: Partial<StoredQuota> = {},
): StoredQuota => ({
  id,
  name: `Quota ${id}`,
  condition,
  limit: 2,
  count: 0,
  message: null,
  ...overrides,
});

const city = (value: string) => ({
  logic: "AND",
  rules: [{ questionId: "q-city", operator: "equals", value }],
});

const ALL = new Set(["q-city", "q-age"]);

describe("toQuota", () => {
  it("keeps a quota with a valid condition", () => {
    expect(toQuota(quota("a", city("kyiv")))?.condition).toEqual(city("kyiv"));
  });

  it.each([null, "x", {}, { logic: "AND", rules: [] }, { logic: "NAND", rules: [] }])(
    "drops a quota with the damaged condition %j",
    (condition) => {
      expect(toQuota(quota("a", condition))).toBeNull();
    },
  );
});

describe("matchingQuotas", () => {
  const quotas = [quota("b", city("lviv")), quota("a", city("kyiv")), quota("c", city("kyiv"))];

  it("returns the quotas the answers fall into, ordered by id", () => {
    expect(matchingQuotas(quotas, { "q-city": "kyiv" }, ALL).map((q) => q.id)).toEqual(["a", "c"]);
    expect(matchingQuotas(quotas, { "q-city": "lviv" }, ALL).map((q) => q.id)).toEqual(["b"]);
  });

  it("returns none when nothing matches or the question was skipped", () => {
    expect(matchingQuotas(quotas, { "q-city": "odesa" }, ALL)).toEqual([]);
    expect(matchingQuotas(quotas, {}, ALL)).toEqual([]);
  });

  it("does not count an answer to a question that was not shown", () => {
    expect(matchingQuotas(quotas, { "q-city": "kyiv" }, new Set(["q-age"]))).toEqual([]);
  });

  it("combines the rules of a condition with AND and OR", () => {
    const rules = [
      { questionId: "q-city", operator: "equals", value: "kyiv" },
      { questionId: "q-age", operator: "gt", value: 30 },
    ];
    const both = [quota("and", { logic: "AND", rules }), quota("or", { logic: "OR", rules })];

    expect(matchingQuotas(both, { "q-city": "kyiv", "q-age": 20 }, ALL).map((q) => q.id)).toEqual([
      "or",
    ]);
    expect(matchingQuotas(both, { "q-city": "kyiv", "q-age": 40 }, ALL).map((q) => q.id)).toEqual([
      "and",
      "or",
    ]);
  });

  it("skips a damaged quota instead of failing", () => {
    expect(
      matchingQuotas([quota("x", 5), quota("a", city("kyiv"))], { "q-city": "kyiv" }, ALL),
    ).toHaveLength(1);
  });

  it("does not change its input", () => {
    const before = JSON.stringify(quotas);

    matchingQuotas(quotas, { "q-city": "kyiv" }, ALL);

    expect(JSON.stringify(quotas)).toBe(before);
  });
});

describe("fullMatchingQuota", () => {
  it("finds a matching quota that has no places left", () => {
    const quotas = [quota("a", city("kyiv"), { count: 1 }), quota("b", city("kyiv"), { count: 2 })];

    expect(fullMatchingQuota(quotas, { "q-city": "kyiv" }, ALL)?.id).toBe("b");
  });

  it("counts a quota whose limit was lowered below its count as full", () => {
    expect(
      fullMatchingQuota(
        [quota("a", city("kyiv"), { count: 9, limit: 3 })],
        { "q-city": "kyiv" },
        ALL,
      )?.id,
    ).toBe("a");
  });

  it("ignores full quotas the answers do not fall into, and open ones", () => {
    const quotas = [quota("a", city("lviv"), { count: 2 }), quota("b", city("kyiv"), { count: 1 })];

    expect(fullMatchingQuota(quotas, { "q-city": "kyiv" }, ALL)).toBeNull();
  });
});

describe("findQuotaIssues / assertQuotasValid", () => {
  const questions = [
    { id: "q-city", type: "CHOICE_SINGLE" as const },
    { id: "q-rank", type: "RANKING" as const },
  ];

  it("accepts quotas on questions that exist and can be compared", () => {
    expect(findQuotaIssues([quota("a", city("kyiv"))], questions)).toEqual([]);
    expect(() => assertQuotasValid([quota("a", city("kyiv"))], questions)).not.toThrow();
    expect(findQuotaIssues([], questions)).toEqual([]);
  });

  it("reports a deleted question and a type that cannot be compared, per quota", () => {
    const quotas = [
      quota("gone", {
        logic: "AND",
        rules: [{ questionId: "nope", operator: "equals", value: 1 }],
      }),
      quota("rank", {
        logic: "AND",
        rules: [{ questionId: "q-rank", operator: "equals", value: "x" }],
      }),
      quota("ok", city("kyiv")),
    ];

    expect(findQuotaIssues(quotas, questions)).toEqual([
      { quotaId: "gone", questionId: "nope", reason: "UNKNOWN_QUESTION" },
      { quotaId: "rank", questionId: "q-rank", reason: "UNSUPPORTED_QUESTION_TYPE" },
    ]);
  });

  it("does not let a damaged stored condition block saving the form", () => {
    expect(findQuotaIssues([quota("x", "garbage")], questions)).toEqual([]);
  });

  it("throws FORM_INVALID_QUOTAS with the issues", () => {
    expect.assertions(2);

    try {
      assertQuotasValid(
        [
          quota("gone", {
            logic: "AND",
            rules: [{ questionId: "nope", operator: "equals", value: 1 }],
          }),
        ],
        questions,
      );
    } catch (error) {
      expect(error).toMatchObject({ message: ErrorCode.FORM_INVALID_QUOTAS, statusCode: 400 });
      expect(error).toMatchObject({
        errors: [{ quotaId: "gone", questionId: "nope", reason: "UNKNOWN_QUESTION" }],
      });
    }
  });
});

describe("assertQuotaCapacity", () => {
  it("allows quotas up to the limit and refuses one more", () => {
    expect(() => assertQuotaCapacity(QUOTA_LIMITS.perForm - 1)).not.toThrow();
    expect(() => assertQuotaCapacity(QUOTA_LIMITS.perForm)).toThrow(
      expect.objectContaining({ message: ErrorCode.QUOTA_LIMIT_REACHED, statusCode: 409 }),
    );
  });
});

describe("assertQuotasOpen", () => {
  const quotas = [quota("a", city("kyiv"), { count: 2, message: "Kyiv is full" })];

  it("refuses answers that fall into a full quota, with the owner's message", () => {
    expect(() => assertQuotasOpen(quotas, { "q-city": "kyiv" }, ALL)).toThrow(
      expect.objectContaining({
        message: ErrorCode.QUOTA_FULL,
        statusCode: 409,
        errors: { message: "Kyiv is full" },
      }),
    );
  });

  it("lets other answers through", () => {
    expect(() => assertQuotasOpen(quotas, { "q-city": "lviv" }, ALL)).not.toThrow();
    expect(() => assertQuotasOpen([], { "q-city": "kyiv" }, ALL)).not.toThrow();
  });

  it("never tells the respondent the name or the condition of the quota", () => {
    expect.assertions(1);

    try {
      assertQuotasOpen(quotas, { "q-city": "kyiv" }, ALL);
    } catch (error) {
      expect(JSON.stringify(error)).not.toMatch(/Quota a|q-city|kyiv/);
    }
  });
});

describe("claimQuotaPlaces", () => {
  const asQuota = (id: string, message: string | null = null) =>
    toQuota(quota(id, city("kyiv"), { message }))!;

  // A transaction whose conditional UPDATE succeeds for the ids in `open`; `rows` is what the
  // re-read after a failed UPDATE finds (an id that is absent there was deleted).
  const fakeTx = (
    open: string[],
    rows: Record<string, { count: number; limit: number; message?: string | null }> = {},
  ) => {
    const updateMany = vi.fn(async ({ where }: { where: { id: string } }) => ({
      count: open.includes(where.id) ? 1 : 0,
    }));
    const findUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = rows[where.id];

      return row ? { message: null, ...row } : null;
    });

    return {
      tx: { formQuota: { updateMany, findUnique, fields: { limit: "LIMIT" } } } as never,
      updateMany,
      findUnique,
    };
  };

  it("takes a place in every quota, in the given order, and reports which", async () => {
    const { tx, updateMany } = fakeTx(["a", "b", "c"]);

    await expect(claimQuotaPlaces(tx, [asQuota("a"), asQuota("b"), asQuota("c")])).resolves.toEqual(
      ["a", "b", "c"],
    );
    expect(updateMany.mock.calls.map(([arg]) => arg.where.id)).toEqual(["a", "b", "c"]);
    expect(updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: "a", count: { lt: "LIMIT" } },
      data: { count: { increment: 1 } },
    });
  });

  it("does nothing for no quotas", async () => {
    const { tx, updateMany } = fakeTx([]);

    await expect(claimQuotaPlaces(tx, [])).resolves.toEqual([]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("throws QUOTA_FULL with the message of the quota that is full, and stops there", async () => {
    const { tx, updateMany } = fakeTx(["a"], { b: { count: 5, limit: 5, message: "B is full" } });

    await expect(
      claimQuotaPlaces(tx, [asQuota("a"), asQuota("b"), asQuota("c")]),
    ).rejects.toMatchObject({
      message: ErrorCode.QUOTA_FULL,
      statusCode: 409,
      errors: { message: "B is full" },
    });
    // "c" is never reached: the transaction fails and rolls "a" back.
    expect(updateMany.mock.calls.map(([arg]) => arg.where.id)).toEqual(["a", "b"]);
  });

  it("treats a quota with a count above its lowered limit as full", async () => {
    const { tx } = fakeTx([], { a: { count: 9, limit: 3 } });

    await expect(claimQuotaPlaces(tx, [asQuota("a")])).rejects.toMatchObject({
      message: ErrorCode.QUOTA_FULL,
    });
  });

  it("skips a quota that was deleted while the submit was running", async () => {
    const { tx } = fakeTx(["b"], {});

    await expect(claimQuotaPlaces(tx, [asQuota("a"), asQuota("b")])).resolves.toEqual(["b"]);
  });

  it("tries again when the limit was raised meanwhile, and takes the place", async () => {
    let calls = 0;
    const updateMany = vi.fn(async () => ({ count: ++calls === 1 ? 0 : 1 }));
    const findUnique = vi.fn(async () => ({ count: 2, limit: 5, message: null }));
    const tx = { formQuota: { updateMany, findUnique, fields: { limit: "LIMIT" } } } as never;

    await expect(claimQuotaPlaces(tx, [asQuota("a")])).resolves.toEqual(["a"]);
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("gives up as full rather than accept a response that was not counted", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const findUnique = vi.fn(async () => ({ count: 2, limit: 5, message: "Try later" }));
    const tx = { formQuota: { updateMany, findUnique, fields: { limit: "LIMIT" } } } as never;

    await expect(claimQuotaPlaces(tx, [asQuota("a", "Try later")])).rejects.toMatchObject({
      message: ErrorCode.QUOTA_FULL,
      errors: { message: "Try later" },
    });
    expect(updateMany).toHaveBeenCalledTimes(3);
  });
});

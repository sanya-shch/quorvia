import { describe, expect, it } from "vitest";
import { MAX_RESPONSES_LIMIT } from "@quorvia/shared-types";
import { updateFormSchema } from "./form.schema.js";

const parse = (extra: Record<string, unknown>) =>
  updateFormSchema.safeParse({ title: "Form", questions: [], ...extra });

describe("updateFormSchema: closesAt", () => {
  it.each([
    "2026-12-31T23:59:59.000Z",
    "2026-12-31T23:59:59Z",
    "2026-12-31T23:59:59+02:00",
    "2026-12-31T23:59:59.123-05:30",
  ])("accepts %s", (closesAt) => {
    expect(parse({ closesAt }).success).toBe(true);
  });

  it("accepts null (remove) and an omitted field", () => {
    expect(parse({ closesAt: null }).success).toBe(true);
    expect(parse({}).success).toBe(true);
  });

  it.each([
    "2026-12-31",
    "2026-12-31T23:59:59",
    "31.12.2026",
    "tomorrow",
    "2026-13-45T00:00:00Z",
    "",
    1767225599000,
  ])("rejects %j", (closesAt) => {
    expect(parse({ closesAt }).success).toBe(false);
  });
});

describe("updateFormSchema: maxResponses", () => {
  it("accepts whole numbers from 1 to the maximum, and null", () => {
    expect(parse({ maxResponses: 1 }).success).toBe(true);
    expect(parse({ maxResponses: 100 }).success).toBe(true);
    expect(parse({ maxResponses: MAX_RESPONSES_LIMIT }).success).toBe(true);
    expect(parse({ maxResponses: null }).success).toBe(true);
  });

  it.each([0, -1, 1.5, MAX_RESPONSES_LIMIT + 1, "10", NaN, Infinity])(
    "rejects %j",
    (maxResponses) => {
      expect(parse({ maxResponses }).success).toBe(false);
    },
  );

  it("does not let a client set the counter", () => {
    const result = parse({ responseCount: 0 });

    // Unknown keys are dropped, never stored.
    expect(result.success && "responseCount" in result.data).toBe(false);
  });
});

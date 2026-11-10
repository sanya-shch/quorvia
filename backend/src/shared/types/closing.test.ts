import { describe, expect, it } from "vitest";
import { CLOSED_ERROR_CODES, ErrorCode, getClosedReason } from "@quorvia/shared-types";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const before = (ms: number) => new Date(NOW.getTime() - ms);
const after = (ms: number) => new Date(NOW.getTime() + ms);

describe("getClosedReason", () => {
  it("is open when nothing limits the form", () => {
    expect(getClosedReason({}, NOW)).toBeNull();
    expect(
      getClosedReason({ closesAt: null, maxResponses: null, responseCount: 40 }, NOW),
    ).toBeNull();
  });

  it("closes by date once the moment has come, exactly at it and after it", () => {
    expect(getClosedReason({ closesAt: after(1) }, NOW)).toBeNull();
    expect(getClosedReason({ closesAt: NOW }, NOW)).toBe("DATE");
    expect(getClosedReason({ closesAt: before(1) }, NOW)).toBe("DATE");
  });

  it("accepts the date as an ISO string", () => {
    expect(getClosedReason({ closesAt: before(1000).toISOString() }, NOW)).toBe("DATE");
    expect(getClosedReason({ closesAt: after(1000).toISOString() }, NOW)).toBeNull();
  });

  it("ignores an unparseable date instead of closing the form", () => {
    expect(getClosedReason({ closesAt: "not a date" }, NOW)).toBeNull();
  });

  it("closes by limit when the counter reaches the maximum", () => {
    expect(getClosedReason({ maxResponses: 3, responseCount: 2 }, NOW)).toBeNull();
    expect(getClosedReason({ maxResponses: 3, responseCount: 3 }, NOW)).toBe("LIMIT");
    expect(getClosedReason({ maxResponses: 3, responseCount: 7 }, NOW)).toBe("LIMIT");
  });

  it("does not guess a limit it cannot compare", () => {
    expect(getClosedReason({ maxResponses: 3 }, NOW)).toBeNull();
    expect(getClosedReason({ responseCount: 99 }, NOW)).toBeNull();
  });

  it("names the date when both rules apply", () => {
    expect(getClosedReason({ closesAt: before(1), maxResponses: 1, responseCount: 5 }, NOW)).toBe(
      "DATE",
    );
  });

  it("uses the real time when no clock is given", () => {
    expect(getClosedReason({ closesAt: new Date(Date.now() - 1000) })).toBe("DATE");
    expect(getClosedReason({ closesAt: new Date(Date.now() + 60_000) })).toBeNull();
  });
});

describe("CLOSED_ERROR_CODES", () => {
  it("maps each reason to its own API code", () => {
    expect(CLOSED_ERROR_CODES.DATE).toBe(ErrorCode.FORM_CLOSED_BY_DATE);
    expect(CLOSED_ERROR_CODES.LIMIT).toBe(ErrorCode.FORM_CLOSED_BY_LIMIT);
  });
});

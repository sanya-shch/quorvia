import { describe, expect, it } from "vitest";
import { isValidRange, rangeDays, resolvePeriod, toQuery } from "./period";

const NOW = new Date("2026-11-18T15:30:00Z");

describe("resolvePeriod", () => {
  it("останні N днів закінчуються сьогодні й включають його", () => {
    expect(resolvePeriod("30d", NOW)).toEqual({ from: "2026-10-20", to: "2026-11-18" });
    expect(resolvePeriod("7d", NOW)).toEqual({ from: "2026-11-12", to: "2026-11-18" });
    expect(rangeDays(resolvePeriod("30d", NOW))).toBe(30);
  });

  it("'весь час' - без меж", () => {
    expect(resolvePeriod("all", NOW)).toEqual({});
  });

  it("свій діапазон береться як є, порожні кінці відкидаються", () => {
    expect(resolvePeriod("custom", NOW, { from: "2026-01-01", to: "" })).toEqual({
      from: "2026-01-01",
    });
  });

  it("межі рахуються за UTC, а не за часовим поясом браузера", () => {
    expect(resolvePeriod("7d", new Date("2026-11-18T23:59:00Z")).to).toBe("2026-11-18");
  });
});

describe("isValidRange / toQuery / rangeDays", () => {
  it("початок після кінця - некоректно", () => {
    expect(isValidRange({ from: "2026-02-01", to: "2026-01-01" })).toBe(false);
    expect(isValidRange({ from: "2026-01-01" })).toBe(true);
    expect(isValidRange({})).toBe(true);
  });

  it("порожні значення не потрапляють у запит, а без параметрів запит порожній", () => {
    expect(toQuery({})).toBe("");
    expect(toQuery({ from: undefined, status: "" })).toBe("");
    expect(toQuery({ from: "2026-01-01", steps: 3 })).toBe("?from=2026-01-01&steps=3");
  });

  it("для відкритого періоду кількості днів немає", () => {
    expect(rangeDays({ from: "2026-01-01" })).toBeNull();
  });
});

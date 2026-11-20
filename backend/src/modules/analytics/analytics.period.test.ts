import { describe, expect, it } from "vitest";
import {
  daysOf,
  isOpenPeriod,
  median,
  parseAnalyticsPeriod,
  periodFilter,
  previousPeriod,
  toPeriodDto,
} from "./analytics.period.js";

describe("parseAnalyticsPeriod", () => {
  it("гола дата: from - початок дня, to - кінець дня (UTC)", () => {
    expect(parseAnalyticsPeriod({ from: "2026-11-01", to: "2026-11-02" })).toEqual({
      from: new Date("2026-11-01T00:00:00.000Z"),
      to: new Date("2026-11-02T23:59:59.999Z"),
    });
  });

  it("повний ISO-момент не змінюється", () => {
    const { to } = parseAnalyticsPeriod({ to: "2026-11-02T10:30:00.000Z" });
    expect(to).toEqual(new Date("2026-11-02T10:30:00.000Z"));
  });

  it("порожнє, сміття й не-рядки ігноруються", () => {
    expect(parseAnalyticsPeriod({})).toEqual({});
    expect(parseAnalyticsPeriod({ from: "", to: "not-a-date" })).toEqual({});
    expect(parseAnalyticsPeriod({ from: 5, to: ["2026-01-01"] })).toEqual({});
  });

  it("поміняні місцями межі виправляє", () => {
    const period = parseAnalyticsPeriod({ from: "2026-11-10", to: "2026-11-01" });
    expect(period.from!.getTime()).toBeLessThan(period.to!.getTime());
  });
});

describe("periodFilter", () => {
  it("без періоду - порожній фільтр, щоб запит лишався таким, як до періодів", () => {
    expect(periodFilter("createdAt")).toEqual({});
    expect(periodFilter("createdAt", {})).toEqual({});
  });

  it("з одним кінцем - лише gte або lte", () => {
    const from = new Date("2026-01-01");
    expect(periodFilter("startedAt", { from })).toEqual({ startedAt: { gte: from } });
    expect(periodFilter("startedAt", { to: from })).toEqual({ startedAt: { lte: from } });
  });
});

describe("previousPeriod", () => {
  it("періоди однакової довжини впритул: попередній закінчується за мілісекунду до початку", () => {
    const period = parseAnalyticsPeriod({ from: "2026-11-11", to: "2026-11-20" }); // 10 днів
    const previous = previousPeriod(period)!;

    expect(previous.to!.getTime()).toBe(period.from!.getTime() - 1);
    expect(previous.to!.getTime() - previous.from!.getTime()).toBe(
      period.to!.getTime() - period.from!.getTime(),
    );
  });

  it("для відкритого періоду порівняння немає", () => {
    expect(previousPeriod({})).toBeUndefined();
    expect(previousPeriod({ from: new Date() })).toBeUndefined();
    expect(isOpenPeriod({ from: new Date() })).toBe(true);
  });
});

describe("daysOf", () => {
  it("кожен календарний день UTC включно з крайніми", () => {
    const period = parseAnalyticsPeriod({ from: "2026-02-27", to: "2026-03-02" });
    expect(daysOf(period)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("для відкритого періоду порожньо", () => {
    expect(daysOf({ from: new Date() })).toEqual([]);
  });
});

describe("toPeriodDto / median", () => {
  it("відкриті межі - null", () => {
    expect(toPeriodDto({})).toEqual({ from: null, to: null });
  });

  it("медіана: порожньо - null, непарна - середній, парна - середнє двох", () => {
    expect(median([])).toBeNull();
    expect(median([9, 1, 5])).toBe(5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

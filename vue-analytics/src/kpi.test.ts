import { describe, expect, it } from "vitest";
import type { AnalyticsPeriodTotals } from "@quorvia/shared-types";
import {
  formatDuration,
  formatSigned,
  kpiDeltas,
  percentChange,
  pointsChange,
  trendOf,
} from "./kpi";

const totals = (overrides: Partial<AnalyticsPeriodTotals>): AnalyticsPeriodTotals => ({
  responses: 0,
  started: 0,
  completed: 0,
  abandoned: 0,
  completionRate: 0,
  medianCompletionSeconds: null,
  ...overrides,
});

describe("percentChange / pointsChange", () => {
  it("зміна у відсотках; ділити на нуль не можна - null", () => {
    expect(percentChange(112, 100)).toBeCloseTo(12);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(5, 0)).toBeNull();
  });

  it("частка завершення - у відсоткових пунктах", () => {
    expect(pointsChange(0.854, 0.823)).toBeCloseTo(3.1);
  });
});

describe("kpiDeltas", () => {
  it("без попереднього періоду порівняння немає", () => {
    expect(kpiDeltas(totals({ responses: 3 }), null)).toBeNull();
  });

  it("рахує зміни; без попередніх спроб частку не порівнює", () => {
    const deltas = kpiDeltas(
      totals({ responses: 112, started: 10, completionRate: 0.5 }),
      totals({ responses: 100, started: 0, completionRate: 0 }),
    )!;

    expect(deltas.responses).toBeCloseTo(12);
    expect(deltas.started).toBeNull();
    expect(deltas.completionPoints).toBeNull();
  });
});

describe("trendOf / formatting", () => {
  it("майже нуль - 'без змін'", () => {
    expect(trendOf(0.01)).toBe("flat");
    expect(trendOf(null)).toBe("flat");
    expect(trendOf(3)).toBe("up");
    expect(trendOf(-3)).toBe("down");
  });

  it("тривалість: секунди, хвилини, години", () => {
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(134)).toBe("2m 14s");
    expect(formatDuration(3900)).toBe("1h 05m");
  });

  it("знак у змін", () => {
    expect(formatSigned(12.84)).toBe("+12.8");
    expect(formatSigned(-3.1)).toBe("-3.1");
    expect(formatSigned(0)).toBe("0.0");
  });
});

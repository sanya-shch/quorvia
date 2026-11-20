import type { AnalyticsPeriodTotals } from "@quorvia/shared-types";

// The change of a count against the previous period, in percent. null when there is nothing
// to divide by (the previous period had none): "+∞%" says nothing, the card shows "new" instead.
export const percentChange = (current: number, previous: number): number | null =>
  previous === 0 ? null : ((current - previous) / previous) * 100;

// The completion rate is already a percentage, so its change is in percentage points.
export const pointsChange = (current: number, previous: number): number =>
  (current - previous) * 100;

export type Trend = "up" | "down" | "flat";

export const trendOf = (value: number | null): Trend =>
  value === null || Math.abs(value) < 0.05 ? "flat" : value > 0 ? "up" : "down";

export interface KpiDeltas {
  responses: number | null;
  started: number | null;
  completionPoints: number | null;
}

// Everything the cards compare; null as a whole when there is no previous period (all time).
export const kpiDeltas = (
  current: AnalyticsPeriodTotals,
  previous: AnalyticsPeriodTotals | null,
): KpiDeltas | null => {
  if (!previous) return null;

  return {
    responses: percentChange(current.responses, previous.responses),
    started: percentChange(current.started, previous.started),
    // Without any started attempt before there is no rate to compare with.
    completionPoints:
      previous.started === 0 ? null : pointsChange(current.completionRate, previous.completionRate),
  };
};

// "2m 14s", "45s", "1h 05m": a duration from seconds; "-" when there is none.
export const formatDuration = (seconds: number | null): string => {
  if (seconds === null) return "-";

  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;

  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
};

export const formatPercent = (fraction: number, digits = 1): string =>
  `${(fraction * 100).toFixed(digits)}%`;

export const formatSigned = (value: number, digits = 1): string =>
  `${value > 0 ? "+" : value < 0 ? "-" : ""}${Math.abs(value).toFixed(digits)}`;

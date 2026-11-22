import type { PeriodParams } from "../../../api/workspaceApi";

export type OverviewPreset = "7d" | "30d" | "90d" | "all";
export const OVERVIEW_PRESETS: OverviewPreset[] = ["7d", "30d", "90d", "all"];

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The query for a preset, in whole UTC days (the backend reads a bare date as the whole day).
 * "All time" runs from the day the form was created: a closed period is what gives the activity
 * chart its per-day series (a form older than a year has none, and the chart says so), and there
 * is nothing before creation to compare with, so `compare` is false.
 */
export const resolveOverviewPeriod = (
  preset: OverviewPreset,
  now: Date,
  createdAt?: string,
): { params: PeriodParams; compare: boolean } => {
  if (preset === "all") {
    return {
      params: createdAt ? { from: utcDay(new Date(createdAt)), to: utcDay(now) } : {},
      compare: false,
    };
  }

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  return {
    params: { from: utcDay(new Date(now.getTime() - (days - 1) * DAY_MS)), to: utcDay(now) },
    compare: true,
  };
};

// "+18.4%" / "-3.1%"; null when there is nothing to compare with (never a made-up change).
export const percentChange = (current: number, previous: number): number | null =>
  previous === 0 ? null : ((current - previous) / previous) * 100;

export const formatDuration = (seconds: number | null): string => {
  if (seconds === null) return "-";
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
};

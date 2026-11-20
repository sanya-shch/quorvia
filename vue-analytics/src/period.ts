// The period the analytics page is limited to. The picker works in whole UTC days: the backend
// reads a bare "YYYY-MM-DD" as the start of that day (`from`) or the end of it (`to`), so "last
// 30 days" is the 30 days ending today, today included, with no timezone drift between the
// browser and the server.
export type PeriodPreset = "7d" | "30d" | "90d" | "all" | "custom";

export type PeriodRange = { from?: string; to?: string };

export const PERIOD_PRESETS: PeriodPreset[] = ["7d", "30d", "90d", "all", "custom"];

const PRESET_DAYS: Record<"7d" | "30d" | "90d", number> = { "7d": 7, "30d": 30, "90d": 90 };
const DAY_MS = 24 * 60 * 60 * 1000;

const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

export const resolvePeriod = (
  preset: PeriodPreset,
  now: Date,
  custom: PeriodRange = {},
): PeriodRange => {
  if (preset === "all") return {};
  if (preset === "custom") {
    // An unfinished custom range (one end empty) is still a valid half-open filter.
    return { ...(custom.from && { from: custom.from }), ...(custom.to && { to: custom.to }) };
  }

  const days = PRESET_DAYS[preset];
  return { from: utcDay(new Date(now.getTime() - (days - 1) * DAY_MS)), to: utcDay(now) };
};

// A custom range whose start is after its end is a typo; the picker shows it as invalid and
// does not send it.
export const isValidRange = (range: PeriodRange): boolean =>
  !range.from || !range.to || range.from <= range.to;

export type QueryParams = Record<string, string | number | undefined>;

// "?a=1&b=2" without the empty values, or "" so a request without filters keeps its old URL.
export const toQuery = (params: QueryParams = {}): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();

  return text ? `?${text}` : "";
};

// How many days the range spans, for the "N days" label; null when it is open.
export const rangeDays = (range: PeriodRange): number | null => {
  if (!range.from || !range.to) return null;

  return Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY_MS) + 1;
};

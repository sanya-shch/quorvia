import type { AnalyticsPeriodDto } from "@quorvia/shared-types";

/**
 * The time window the analytics are limited to. Both ends are inclusive and optional: no
 * `from` means "since the beginning", no `to` means "until now". A closed window is what the
 * previous-period comparison needs (an open one has nothing to be compared with).
 */
export type AnalyticsPeriod = { from?: Date; to?: Date };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// ?from=&to= as ISO dates. A bare date ("2026-11-17") is the whole UTC day: `from` starts it,
// `to` ends it. Anything unparsable is ignored, like ?page=/?limit= are (see parsePagination):
// a typo in a filter must not turn into a 500 or a silently empty page.
const parseBoundary = (value: unknown, end: boolean): Date | undefined => {
  if (typeof value !== "string" || value.trim() === "") return undefined;

  const text = value.trim();
  const date = new Date(DATE_ONLY.test(text) ? `${text}T00:00:00.000Z` : text);
  if (Number.isNaN(date.getTime())) return undefined;

  return DATE_ONLY.test(text) && end ? new Date(date.getTime() + DAY_MS - 1) : date;
};

export const parseAnalyticsPeriod = (query: { from?: unknown; to?: unknown }): AnalyticsPeriod => {
  const from = parseBoundary(query.from, false);
  const to = parseBoundary(query.to, true);

  // Swapped ends are a mistake with an obvious meaning.
  if (from && to && from.getTime() > to.getTime()) return { from: to, to: from };

  return { ...(from && { from }), ...(to && { to }) };
};

export const isOpenPeriod = (period?: AnalyticsPeriod): boolean => !period?.from || !period?.to;

// The Prisma filter for a timestamp column; {} (no filter) for an empty period, so a query
// without a period keeps exactly the shape it had before periods existed.
export const periodFilter = <K extends string>(
  column: K,
  period?: AnalyticsPeriod,
): { [P in K]?: { gte?: Date; lte?: Date } } => {
  if (!period?.from && !period?.to) return {};

  return {
    [column]: {
      ...(period.from && { gte: period.from }),
      ...(period.to && { lte: period.to }),
    },
  } as { [P in K]?: { gte?: Date; lte?: Date } };
};

// The window of equal length that ends right before `period` starts; undefined when the period
// is open on either side.
export const previousPeriod = (period: AnalyticsPeriod): AnalyticsPeriod | undefined => {
  if (!period.from || !period.to) return undefined;

  const length = period.to.getTime() - period.from.getTime();
  const to = new Date(period.from.getTime() - 1);

  return { from: new Date(to.getTime() - length), to };
};

export const toPeriodDto = (period: AnalyticsPeriod): AnalyticsPeriodDto => ({
  from: period.from?.toISOString() ?? null,
  to: period.to?.toISOString() ?? null,
});

export const isInPeriod = (date: Date, period: AnalyticsPeriod): boolean =>
  (!period.from || date >= period.from) && (!period.to || date <= period.to);

// UTC calendar days from the day of `from` to the day of `to`, as YYYY-MM-DD.
export const daysOf = (period: AnalyticsPeriod): string[] => {
  if (!period.from || !period.to) return [];

  const days: string[] = [];
  const start = Date.UTC(
    period.from.getUTCFullYear(),
    period.from.getUTCMonth(),
    period.from.getUTCDate(),
  );

  for (let t = start; t <= period.to.getTime(); t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }

  return days;
};

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

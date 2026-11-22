import type { DashboardSummaryDto } from "@quorvia/shared-types";
import { ANALYTICS_MAX_DAILY_DAYS } from "@quorvia/shared-types";
import { prisma } from "../../prisma/prisma.js";
import { summaryTotals } from "../analytics/analytics.service.js";
import {
  daysOf,
  isInPeriod,
  isOpenPeriod,
  previousPeriod,
  toPeriodDto,
  type AnalyticsPeriod,
} from "../analytics/analytics.period.js";

/**
 * The dashboard's numbers over all the user's forms. It is the per-form summary
 * (analytics.service summaryTotals) with a set of form ids instead of one, so the two can never
 * disagree on what "started", "completed" or "completion rate" mean.
 */
export const getDashboardSummary = async (
  userId: string,
  period: AnalyticsPeriod = {},
): Promise<DashboardSummaryDto> => {
  const forms = await prisma.form.findMany({
    where: { userId },
    select: { id: true, isPublished: true, createdAt: true },
  });
  const scope = { in: forms.map((form) => form.id) };

  const closed = !isOpenPeriod(period);
  const withDaily = closed && daysOf(period).length <= ANALYTICS_MAX_DAILY_DAYS;
  const current = await summaryTotals(scope, period);
  const previous = previousPeriod(period);

  return {
    period: toPeriodDto(period),
    forms: {
      total: forms.length,
      published: forms.filter((form) => form.isPublished).length,
      createdInPeriod: closed
        ? forms.filter((form) => isInPeriod(form.createdAt, period)).length
        : 0,
    },
    current: current.totals,
    previous: previous ? (await summaryTotals(scope, previous)).totals : null,
    daily: withDaily ? current.daily : [],
  };
};

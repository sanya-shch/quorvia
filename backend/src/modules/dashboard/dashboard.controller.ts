import type { Request, Response } from "express";
import type { DashboardSummaryDto } from "@quorvia/shared-types";
import { parseAnalyticsPeriod } from "../analytics/analytics.period.js";
import { getDashboardSummary } from "./dashboard.service.js";

import type { AuthLocals } from "../../shared/middleware/auth.js";

export const getDashboardSummaryHandler = async (
  req: Request<
    Record<string, never>,
    DashboardSummaryDto,
    unknown,
    { from?: unknown; to?: unknown }
  >,
  res: Response<DashboardSummaryDto>,
) => {
  const userId = (res.locals as AuthLocals).userId;

  res.json(await getDashboardSummary(userId, parseAnalyticsPeriod(req.query)));
};

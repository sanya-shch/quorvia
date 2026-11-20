import { parsePagination } from "../../shared/utils/pagination.js";
import type { Request, Response } from "express";
import {
  getFormAnalytics,
  getFormPaths,
  getQuestionAnalytics,
  getResponseById,
  getResponses,
  getFormFunnel,
  getFormJourneys,
  getFormSummary,
} from "./analytics.service.js";
import { parseAnalyticsPeriod } from "./analytics.period.js";
import {
  JOURNEY_DEFAULT_STEPS,
  JOURNEY_MAX_STEPS,
  JOURNEY_STATUSES,
  type AnalyticsSummaryDto,
  type FormJourneysDto,
  type JourneyStatus,
} from "@quorvia/shared-types";
import type {
  FormAnalyticsDto,
  FormFunnelDto,
  FormPathsDto,
  GetResponsesQuery,
  QuestionAnalyticsDto,
  ResponseDetailsDto,
  ResponseListDto,
} from "./analytics.types.js";
import type { AuthLocals } from "../../shared/middleware/auth.js";

// ?from=&to= (ISO dates) limit every analytics view to a period; see parseAnalyticsPeriod.
type PeriodQuery = { from?: unknown; to?: unknown };

// ?status= and ?steps= of the journey map. Unknown values fall back to the defaults (the same
// forgiving rule as ?page=/?limit=), and steps is clamped so one request cannot ask for a
// diagram of thousands of columns.
const parseJourneyQuery = (query: { status?: unknown; steps?: unknown }) => {
  const status = (JOURNEY_STATUSES as readonly unknown[]).includes(query.status)
    ? (query.status as JourneyStatus)
    : "all";
  const steps = Number(query.steps);

  return {
    status,
    steps: Number.isInteger(steps)
      ? Math.min(Math.max(steps, 1), JOURNEY_MAX_STEPS)
      : JOURNEY_DEFAULT_STEPS,
  };
};

// Express 5 forwards rejected promises of async handlers to errorHandler itself, so no
// try/catch or asyncHandler wrappers are needed here.

export const getAnalyticsHandler = async (
  req: Request<{ formId: string }, FormAnalyticsDto, unknown, PeriodQuery>,
  res: Response<FormAnalyticsDto>,
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  res.json(await getFormAnalytics(formId, userId, parseAnalyticsPeriod(req.query)));
};

export const getQuestionAnalyticsHandler = async (
  req: Request<{ formId: string; questionId: string }, QuestionAnalyticsDto, unknown, PeriodQuery>,
  res: Response<QuestionAnalyticsDto>,
) => {
  const { formId, questionId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  res.json(await getQuestionAnalytics(formId, questionId, userId, parseAnalyticsPeriod(req.query)));
};

export const getFormPathsHandler = async (
  req: Request<{ formId: string }, FormPathsDto, unknown, PeriodQuery>,
  res: Response<FormPathsDto>,
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  res.json(await getFormPaths(formId, userId, parseAnalyticsPeriod(req.query)));
};

export const getResponsesHandler = async (
  req: Request<{ formId: string }, ResponseListDto, unknown, GetResponsesQuery>,
  res: Response<ResponseListDto>,
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;
  const { page, limit } = parsePagination(req.query);

  res.json(await getResponses(formId, userId, page, limit));
};

export const getResponseByIdHandler = async (
  req: Request<{ formId: string; responseId: string }, ResponseDetailsDto>,
  res: Response<ResponseDetailsDto>,
) => {
  const { formId, responseId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  res.json(await getResponseById(formId, responseId, userId));
};

export const getFormFunnelHandler = async (
  req: Request<{ formId: string }, FormFunnelDto, unknown, PeriodQuery>,
  res: Response<FormFunnelDto>,
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  res.json(await getFormFunnel(formId, userId, parseAnalyticsPeriod(req.query)));
};

export const getFormSummaryHandler = async (
  req: Request<{ formId: string }, AnalyticsSummaryDto, unknown, PeriodQuery>,
  res: Response<AnalyticsSummaryDto>,
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  res.json(await getFormSummary(formId, userId, parseAnalyticsPeriod(req.query)));
};

export const getFormJourneysHandler = async (
  req: Request<
    { formId: string },
    FormJourneysDto,
    unknown,
    PeriodQuery & { status?: unknown; steps?: unknown }
  >,
  res: Response<FormJourneysDto>,
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  res.json(
    await getFormJourneys(formId, userId, {
      ...parseJourneyQuery(req.query),
      period: parseAnalyticsPeriod(req.query),
    }),
  );
};

import { parsePagination } from "../../shared/utils/pagination.js";
import type { Request, Response } from "express";
import {
  getFormAnalytics,
  getFormPaths,
  getQuestionAnalytics,
  getResponseById,
  getResponses,
  getFormFunnel,
} from "./analytics.service.js";
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

// Express 5 сам передає відхилені проміси async-обробників в errorHandler,
// тому try/catch і обгортки типу asyncHandler тут не потрібні.

export const getAnalyticsHandler = async (
  req: Request<{ formId: string }>,
  res: Response<FormAnalyticsDto>,
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  res.json(await getFormAnalytics(formId, userId));
};

export const getQuestionAnalyticsHandler = async (
  req: Request<{ formId: string; questionId: string }>,
  res: Response<QuestionAnalyticsDto>,
) => {
  const { formId, questionId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  res.json(await getQuestionAnalytics(formId, questionId, userId));
};

export const getFormPathsHandler = async (
  req: Request<{ formId: string }>,
  res: Response<FormPathsDto>,
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  res.json(await getFormPaths(formId, userId));
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
  req: Request<{ formId: string }>,
  res: Response<FormFunnelDto>,
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  res.json(await getFormFunnel(formId, userId));
};

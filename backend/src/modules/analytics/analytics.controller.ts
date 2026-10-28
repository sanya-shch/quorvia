import { parsePagination } from "../../shared/utils/pagination.js";
import { Request, Response, NextFunction } from "express";
import {
  getFormAnalytics,
  getFormPaths,
  getQuestionAnalytics,
  getResponseById,
  getResponses,
  getFormFunnel,
} from "./analytics.service.js";
import {
  FormFunnelDto,
  FormPathsDto,
  GetResponsesQuery,
  QuestionAnalyticsDto,
  ResponseDetailsDto,
  ResponseListDto,
} from "./analytics.types.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { AuthLocals } from "../../shared/middleware/auth.js";

export const getAnalyticsHandler = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { formId } = req.params;
    const userId = (res.locals as AuthLocals).userId;

    const data = await getFormAnalytics(formId, userId);

    res.json(data);
  } catch (err) {
    next(err);
  }
};

export const getQuestionAnalyticsHandler = asyncHandler(
  async (
    req: Request<{
      formId: string;
      questionId: string;
    }>,
    res: Response<QuestionAnalyticsDto>,
  ) => {
    const { formId, questionId } = req.params;
    const userId = (res.locals as AuthLocals).userId;

    const data = await getQuestionAnalytics(formId, questionId, userId);

    res.json(data);
  },
);

export const getFormPathsHandler = asyncHandler(
  async (req: Request<{ formId: string }>, res: Response<FormPathsDto>) => {
    const { formId } = req.params;
    const userId = (res.locals as AuthLocals).userId;

    const data = await getFormPaths(formId, userId);

    res.json(data);
  },
);

export const getResponsesHandler = asyncHandler(
  async (
    req: Request<{ formId: string }, ResponseListDto, {}, GetResponsesQuery>,
    res: Response<ResponseListDto>,
  ) => {
    const { formId } = req.params;
    const userId = (res.locals as AuthLocals).userId;

    const { page, limit } = parsePagination(req.query);

    const data = await getResponses(formId, userId, page, limit);

    res.json(data);
  },
);

export const getResponseByIdHandler = asyncHandler(
  async (
    req: Request<
      {
        formId: string;
        responseId: string;
      },
      ResponseDetailsDto
    >,
    res: Response<ResponseDetailsDto>,
  ) => {
    const { formId, responseId } = req.params;
    const userId = (res.locals as AuthLocals).userId;

    const data = await getResponseById(formId, responseId, userId);

    res.json(data);
  },
);

export const getFormFunnelHandler = asyncHandler(
  async (req: Request<{ formId: string }>, res: Response<FormFunnelDto>) => {
    const { formId } = req.params;
    const userId = (res.locals as AuthLocals).userId;

    const data = await getFormFunnel(formId, userId);

    res.json(data);
  },
);

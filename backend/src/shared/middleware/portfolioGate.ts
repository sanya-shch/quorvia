import type { NextFunction, Request, Response } from "express";
import { ErrorCode } from "@quorvia/shared-types";
import { isPortfolioMode } from "../../config/env.js";
import { AppError } from "./errorHandler.js";

/**
 * For routes of features the portfolio deployment does not run (exports, file uploads). The check
 * happens per request, so the same build serves both kinds of deployment.
 */
export const disabledInPortfolio = (_req: Request, _res: Response, next: NextFunction) => {
  if (isPortfolioMode()) {
    return next(new AppError(ErrorCode.FEATURE_DISABLED, 403));
  }

  next();
};

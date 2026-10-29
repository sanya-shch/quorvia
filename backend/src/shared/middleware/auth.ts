import { AppError } from "./errorHandler.js";
import { Response, NextFunction, Request } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { ErrorCode } from "@quorvia/shared-types";

export type AuthLocals = {
  userId: string;
};

export const authMiddleware = (
  req: Request,
  res: Response<any, AuthLocals>,
  next: NextFunction,
) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw new AppError(ErrorCode.AUTH_UNAUTHORIZED, 401);
  }

  const token = header.slice("Bearer ".length);

  try {
    const decoded = verifyAccessToken(token);

    res.locals.userId = decoded.userId;

    next();
  } catch {
    throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, 401);
  }
};

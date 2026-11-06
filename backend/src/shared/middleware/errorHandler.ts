import { Request, Response, NextFunction } from "express";
import { ErrorCode } from "@quorvia/shared-types";

export class AppError<T = unknown> extends Error {
  statusCode: number;
  errors?: T;

  // message is always an ErrorCode (a stable identifier), NOT display text; the frontend
  // translates it. The type stays `string` rather than `ErrorCode` so it does not block the rare
  // places where `errors` carries an arbitrary structure (for example Zod issues) with its own
  // text; the error code itself is still chosen from ErrorCode.
  constructor(message: string, statusCode: number, errors?: T) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

export const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      message: err.message,
      errors: err.errors ?? null,
    });
  }

  // body-parser errors (broken JSON, body too large) are CLIENT errors (400/413), not server
  // failures: they are not logged as 500 and do not get the generic INTERNAL_SERVER_ERROR.
  const bodyError = err as { type?: string };

  if (bodyError?.type === "entity.parse.failed") {
    return res.status(400).json({ message: ErrorCode.REQUEST_BODY_INVALID });
  }

  if (bodyError?.type === "entity.too.large") {
    return res.status(413).json({ message: ErrorCode.REQUEST_TOO_LARGE });
  }

  console.error(err);

  return res.status(500).json({
    message: ErrorCode.INTERNAL_SERVER_ERROR,
  });
};

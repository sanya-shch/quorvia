import { Request, Response, NextFunction } from "express";
import { submitResponse } from "./response.service.js";
import { ResponseDto, submitResponseInput } from "./response.types.js";

export const submitResponseHandler = async (
  req: Request<{ shareId: string }, {}, submitResponseInput>,
  res: Response<ResponseDto>,
  next: NextFunction,
) => {
  try {
    const { shareId } = req.params;
    const { answers, sessionKey, language } = req.body;

    const result = await submitResponse(shareId, answers, sessionKey, language);

    res.json({ id: result.id, createdAt: result.createdAt });
  } catch (err) {
    next(err);
  }
};

import { Request, Response, NextFunction } from "express";
import { saveAttempt } from "./attempt.service.js";
import { SaveAttemptDto, SaveAttemptInput } from "./attempt.types.js";

export const saveAttemptHandler = async (
  req: Request<{ shareId: string }, {}, SaveAttemptInput>,
  res: Response<SaveAttemptDto>,
  next: NextFunction,
) => {
  try {
    const { shareId } = req.params;
    const { sessionKey, answers, reachedQuestionIds } = req.body;

    const result = await saveAttempt(shareId, sessionKey, answers, reachedQuestionIds);

    res.json(result);
  } catch (err) {
    next(err);
  }
};

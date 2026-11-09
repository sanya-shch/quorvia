import { ZodSchema } from "zod";
import { Request, Response, NextFunction } from "express";

export const validate =
  <T>(schema: ZodSchema<T>) =>
  (req: Request<any, any, T>, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        errors: result.error.flatten(),
      });
    }

    req.body = result.data;
    next();
  };

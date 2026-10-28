import { Router } from "express";
import { saveAttemptHandler } from "./attempt.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { saveAttemptSchema } from "./attempt.schema.js";
import { saveAttemptLimiter } from "../../shared/middleware/rateLimiters.js";

const router = Router();

router.put("/:shareId/attempt", saveAttemptLimiter, validate(saveAttemptSchema), saveAttemptHandler);

export default router;

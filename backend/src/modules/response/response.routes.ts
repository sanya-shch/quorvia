import { Router } from 'express';
import { submitResponseHandler } from './response.controller.js';

import { validate } from '../../shared/middleware/validate.js';
import { submitResponseSchema } from './response.schema.js';
import { submitResponseLimiter } from '../../shared/middleware/rateLimiters.js';

const router = Router();

router.post(
  '/:shareId/responses',
  submitResponseLimiter,
  validate(submitResponseSchema),
  submitResponseHandler
);

export default router;

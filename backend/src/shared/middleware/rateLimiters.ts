import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { ErrorCode } from "@quorvia/shared-types";

/**
 * Limits are kept in process memory (the express-rate-limit default), so with several
 * backend instances each one counts separately. For horizontal scaling plug in
 * rate-limit-redis (Redis is already in the project).
 *
 * Behind a reverse proxy set TRUST_PROXY (see app.ts), otherwise req.ip is the proxy's
 * address and all users share one limit.
 */
const rateLimited = { message: ErrorCode.RATE_LIMITED };

const ip = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");

// General "ceiling" for the whole API per IP.
export const createApiLimiter = (limit = 600) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimited,
    keyGenerator: ip,
  });

// POST /api/forms/:shareId/responses: public answer submission.
export const createSubmitResponseLimiter = (limit = 20) =>
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimited,
    keyGenerator: (req) => `${ip(req)}:${req.params.shareId}`,
  });

// PUT /api/forms/:shareId/attempt: autosave (debounced, so more frequent).
export const createSaveAttemptLimiter = (limit = 120) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimited,
    keyGenerator: (req) => `${ip(req)}:${req.params.shareId}`,
  });

// POST /api/auth/refresh: cheaper than login but not unlimited either.
export const createRefreshLimiter = (limit = 60) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimited,
    keyGenerator: ip,
  });

// POST /api/forms/:formId/export: creates a heavy job (PDF/Excel over the whole response
// table). Keyed by user, not IP: the endpoint requires auth.
export const createExportLimiter = (limit = 10) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimited,
    keyGenerator: (req, res) => String((res.locals as { userId?: string }).userId ?? ip(req)),
  });

export const apiLimiter = createApiLimiter();
export const submitResponseLimiter = createSubmitResponseLimiter();
export const saveAttemptLimiter = createSaveAttemptLimiter();
export const exportLimiter = createExportLimiter();
export const refreshLimiter = createRefreshLimiter();

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { ErrorCode } from "@quorvia/shared-types";

/**
 * Ліміти зберігаються в пам'яті процесу (дефолт express-rate-limit), тому
 * при кількох інстансах бекенду кожен рахує окремо. Для горизонтального
 * масштабування підключіть rate-limit-redis (Redis у проєкті вже є).
 *
 * За reverse proxy обов'язково виставте TRUST_PROXY (див. app.ts), інакше
 * req.ip - це адреса проксі, і всі користувачі ділять один ліміт.
 */
const rateLimited = { message: ErrorCode.RATE_LIMITED };

const ip = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");

/** Загальна "стеля" на весь API для одного IP. */
export const createApiLimiter = (limit = 600) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimited,
    keyGenerator: ip,
  });

/** POST /api/forms/:shareId/responses - публічна відправка відповіді. */
export const createSubmitResponseLimiter = (limit = 20) =>
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimited,
    keyGenerator: (req) => `${ip(req)}:${req.params.shareId}`,
  });

/** PUT /api/forms/:shareId/attempt - autosave (debounced, тож частіший). */
export const createSaveAttemptLimiter = (limit = 120) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimited,
    keyGenerator: (req) => `${ip(req)}:${req.params.shareId}`,
  });

/** POST /api/auth/refresh - дешевший за login, але теж не безлімітний. */
export const createRefreshLimiter = (limit = 60) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimited,
    keyGenerator: ip,
  });

/**
 * POST /api/forms/:formId/export - створення важкого завдання (PDF/Excel на
 * всю таблицю відповідей). Ключ - користувач, а не IP: ендпоінт під auth.
 */
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

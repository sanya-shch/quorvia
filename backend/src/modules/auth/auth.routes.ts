import { Router } from "express";
import rateLimit from "express-rate-limit";
import { demo, getMeHandler, login, logout, refresh, register } from "./auth.controller.js";
import { authMiddleware } from "../../shared/middleware/auth.js";
import { validate } from "../../shared/middleware/validate.js";
import { loginSchema, registerSchema } from "./auth.schema.js";
import { ErrorCode } from "@quorvia/shared-types";
import { demoLimiter, refreshLimiter } from "../../shared/middleware/rateLimiters.js";
import { isPortfolioMode } from "../../config/env.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import type { NextFunction, Request, Response } from "express";

const router = Router();

// Unprotected /login and /register would be a ready vector for password brute force or
// mass bot registration. Per-IP limit, 15-minute window.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: ErrorCode.RATE_LIMITED },
});

// The portfolio deployment has no open registration: visitors use a demo account (POST /demo).
const registrationOpen = (_req: Request, _res: Response, next: NextFunction) =>
  isPortfolioMode() ? next(new AppError(ErrorCode.REGISTRATION_DISABLED, 403)) : next();

router.post("/register", registrationOpen, authRateLimiter, validate(registerSchema), register);
router.post("/demo", demoLimiter, demo);
router.post("/login", authRateLimiter, validate(loginSchema), login);
router.post("/refresh", refreshLimiter, refresh);
router.get("/me", authMiddleware, getMeHandler);
router.post("/logout", logout);

export default router;

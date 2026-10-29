import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getMeHandler, login, logout, refresh, register } from "./auth.controller.js";
import { authMiddleware } from "../../shared/middleware/auth.js";
import { validate } from "../../shared/middleware/validate.js";
import { loginSchema, registerSchema } from "./auth.schema.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { ErrorCode } from "@quorvia/shared-types";
import { refreshLimiter } from "../../shared/middleware/rateLimiters.js";

const router = Router();

/**
 * Нічим не обмежені /login і /register - готовий вектор для brute-force
 * підбору паролів чи масової реєстрації ботами. Ліміт per-IP, 15-хвилинне
 * вікно.
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: ErrorCode.RATE_LIMITED },
});

router.post("/register", authRateLimiter, validate(registerSchema), asyncHandler(register));
router.post("/login", authRateLimiter, validate(loginSchema), asyncHandler(login));
router.post("/refresh", refreshLimiter, asyncHandler(refresh));
router.get("/me", authMiddleware, asyncHandler(getMeHandler));
router.post("/logout", asyncHandler(logout));

export default router;

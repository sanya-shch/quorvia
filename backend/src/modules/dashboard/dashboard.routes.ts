import { Router } from "express";
import { authMiddleware } from "../../shared/middleware/auth.js";
import { getDashboardSummaryHandler } from "./dashboard.controller.js";

const router = Router();

router.get("/summary", authMiddleware, getDashboardSummaryHandler);

export default router;

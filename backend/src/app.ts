import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import authRoutes from "./modules/auth/auth.routes.js";
import formRoutes from "./modules/form/form.routes.js";
import responseRoutes from "./modules/response/response.routes.js";
import attemptRoutes from "./modules/attempt/attempt.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import quotaRoutes from "./modules/quota/quota.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import { formAssetRoutes, publicAssetRoutes } from "./modules/asset/asset.routes.js";
import { fileRoutes } from "./modules/file/file.routes.js";

import { errorHandler } from "./shared/middleware/errorHandler.js";
import { isPortfolioMode, parseTrustProxy } from "./config/env.js";
import { disabledInPortfolio } from "./shared/middleware/portfolioGate.js";
import { apiLimiter } from "./shared/middleware/rateLimiters.js";

const app = express();

// The portfolio deployment runs no exports, so the export module (and with it BullMQ and the Redis
// connection it opens on import) is not even loaded there.
const portfolio = isPortfolioMode();

// See TRUST_PROXY in config/env.ts: needed for a correct req.ip behind a proxy.
app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));

app.use(helmet());

app.use(
  cors({
    // CORS_ORIGIN may contain several origins separated by commas.
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map((o) => o.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
  }),
);

app.use("/api", apiLimiter);

app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("Бекенд працює і доступний!");
});

// For uptime checks and for the frontend to wake a sleeping free instance. No database access: it
// answers as soon as the process is up.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Features the portfolio deployment does not run (see docs/deployment.md). Answered explicitly
// (403 FEATURE_DISABLED) instead of falling through to a 404.
app.use("/api/forms/:formId/export", disabledInPortfolio);
app.use("/api/forms/:formId/assets", disabledInPortfolio);
app.use("/api/forms/:shareId/files", disabledInPortfolio);

app.use("/api/auth", authRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/forms", responseRoutes);
app.use("/api/forms", attemptRoutes);
app.use("/api/forms", analyticsRoutes);
if (!portfolio) {
  const { default: exportRoutes } = await import("./modules/export/export.routes.js");
  app.use("/api/forms", exportRoutes);
}
app.use("/api/forms", quotaRoutes);
app.use("/api/forms", formAssetRoutes);
app.use("/api/forms", fileRoutes);
app.use("/api/assets", publicAssetRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use(errorHandler);

export default app;

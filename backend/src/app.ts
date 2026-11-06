import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import authRoutes from "./modules/auth/auth.routes.js";
import formRoutes from "./modules/form/form.routes.js";
import responseRoutes from "./modules/response/response.routes.js";
import attemptRoutes from "./modules/attempt/attempt.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import exportRoutes from "./modules/export/export.routes.js";

import { errorHandler } from "./shared/middleware/errorHandler.js";
import { parseTrustProxy } from "./config/env.js";
import { apiLimiter } from "./shared/middleware/rateLimiters.js";

const app = express();

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

app.use("/api/auth", authRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/forms", responseRoutes);
app.use("/api/forms", attemptRoutes);
app.use("/api/forms", analyticsRoutes);
app.use("/api/forms", exportRoutes);

app.use(errorHandler);

export default app;

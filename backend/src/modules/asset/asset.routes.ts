import { Router } from "express";
import { authMiddleware } from "../../shared/middleware/auth.js";
import { uploadLimiter } from "../../shared/middleware/rateLimiters.js";
import { singleImageUpload } from "./asset.upload.js";
import { getAssetHandler, uploadAssetHandler } from "./asset.controller.js";

// Mounted at /api/forms: owners upload images to a form they own.
export const formAssetRoutes = Router();

// Authentication and the rate limit run BEFORE the multipart parser, so an anonymous
// request never gets its body read.
formAssetRoutes.post(
  "/:formId/assets",
  authMiddleware,
  uploadLimiter,
  singleImageUpload,
  uploadAssetHandler,
);

// Mounted at /api/assets: public, because the published form shows the logo to anyone.
export const publicAssetRoutes = Router();

publicAssetRoutes.get("/:assetId", getAssetHandler);

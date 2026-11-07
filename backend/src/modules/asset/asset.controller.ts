import type { Request, Response } from "express";
import { z } from "zod";
import { ErrorCode, ASSET_KINDS, type AssetDto } from "@quorvia/shared-types";
import { AppError } from "../../shared/middleware/errorHandler.js";
import type { AuthLocals } from "../../shared/middleware/auth.js";
import { getAssetContent, uploadAsset } from "./asset.service.js";

const uploadBodySchema = z.object({ kind: z.enum(ASSET_KINDS).default("LOGO") });

export const uploadAssetHandler = async (
  req: Request<{ formId: string }>,
  res: Response<AssetDto>,
) => {
  const parsed = uploadBodySchema.safeParse(req.body ?? {});

  if (!req.file || !parsed.success) throw new AppError(ErrorCode.ASSET_UPLOAD_INVALID, 400);

  const userId = (res.locals as AuthLocals).userId;
  const asset = await uploadAsset(req.params.formId, userId, parsed.data.kind, req.file.buffer);

  res.status(201).json(asset);
};

export const getAssetHandler = async (req: Request<{ assetId: string }>, res: Response) => {
  const { data, mime } = await getAssetContent(req.params.assetId);

  res.set({
    // The type comes from the DB (set by our own re-encode), never from the upload.
    "Content-Type": mime,
    "Content-Length": String(data.length),
    "X-Content-Type-Options": "nosniff",
    // An image has nothing to run: if it were ever rendered as a document, run nothing.
    "Content-Security-Policy": "default-src 'none'; sandbox",
    // The ids are random and the bytes never change, so the response can be cached forever.
    "Cache-Control": "public, max-age=31536000, immutable",
    // helmet defaults to same-origin, which would block <img> from the frontend origin.
    "Cross-Origin-Resource-Policy": "cross-origin",
  });

  res.send(data);
};

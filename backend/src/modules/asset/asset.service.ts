import { ErrorCode, ASSET_LIMITS, type AssetDto, type AssetKind } from "@quorvia/shared-types";
import { prisma } from "../../prisma/prisma.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { processImage } from "./asset.image.js";
import { defaultStorage, newStorageKey, type Storage } from "./asset.storage.js";

const toDto = (asset: {
  id: string;
  kind: AssetKind;
  mime: string;
  size: number;
  width: number;
  height: number;
}): AssetDto => ({
  id: asset.id,
  kind: asset.kind,
  mime: asset.mime as AssetDto["mime"],
  size: asset.size,
  width: asset.width,
  height: asset.height,
});

export const uploadAsset = async (
  formId: string,
  userId: string,
  kind: AssetKind,
  file: Buffer,
  storage: Storage = defaultStorage,
): Promise<AssetDto> => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { userId: true, _count: { select: { assets: true } } },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  // Soft quota: concurrent uploads may overshoot it by a few, which is harmless; the point
  // is that a form cannot collect unbounded files.
  if (form._count.assets >= ASSET_LIMITS.maxPerForm) {
    throw new AppError(ErrorCode.ASSET_LIMIT_REACHED, 409);
  }

  const image = await processImage(file);
  const storageKey = newStorageKey(image.mime);

  await storage.put(storageKey, image.data);

  try {
    const asset = await prisma.asset.create({
      data: {
        formId,
        kind,
        mime: image.mime,
        size: image.data.length,
        width: image.width,
        height: image.height,
        storageKey,
      },
    });

    return toDto(asset);
  } catch (err) {
    // Do not leave a file without a row behind (the orphan sweep is only the safety net).
    await storage.remove(storageKey).catch(() => undefined);
    throw err;
  }
};

export const getAssetContent = async (assetId: string, storage: Storage = defaultStorage) => {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  const data = asset ? await storage.get(asset.storageKey) : null;

  if (!asset || !data) throw new AppError(ErrorCode.ASSET_NOT_FOUND, 404);

  return { data, mime: asset.mime };
};

/**
 * Checks that an id sent by the client really is an image of THIS form (and of the right
 * kind) before it is attached as the logo; otherwise one could point a form at another
 * user's asset.
 */
export const assertFormAsset = async (
  assetId: string,
  formId: string,
  kind: AssetKind,
): Promise<void> => {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { formId: true, kind: true },
  });

  if (!asset || asset.formId !== formId || asset.kind !== kind) {
    throw new AppError(ErrorCode.ASSET_NOT_FOUND, 400);
  }
};

// Best-effort removal of the files of an already deleted form's assets.
export const removeStoredFiles = async (
  storageKeys: string[],
  storage: Storage = defaultStorage,
): Promise<void> => {
  await Promise.all(storageKeys.map((key) => storage.remove(key).catch(() => false)));
};

import { ErrorCode, ASSET_LIMITS, type AssetMimeType } from "@quorvia/shared-types";
import sharp from "sharp";
import { AppError } from "../../shared/middleware/errorHandler.js";

/**
 * Identifies the format from the leading bytes, ignoring the file name and the
 * client-supplied Content-Type (both are attacker-controlled). Anything that is not
 * PNG, JPEG or WebP, SVG and GIF included, is rejected before a decoder sees it.
 */
export const sniffImageType = (data: Buffer): AssetMimeType | null => {
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }

  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
};

export type ProcessedImage = {
  data: Buffer;
  mime: AssetMimeType;
  width: number;
  height: number;
};

/**
 * Decodes and re-encodes the image. The stored bytes are never the uploaded ones:
 * - EXIF, GPS and other metadata are dropped (the orientation is applied first);
 * - anything appended after the image data or hidden in unused chunks (polyglot files,
 *   for example a valid PNG that is also a script) does not survive the re-encode;
 * - oversized images are scaled down, animation is flattened to the first frame;
 * - the pixel count is capped so a small file cannot expand into gigabytes of memory.
 */
export type ProcessImageOptions = { maxBytes?: number; maxDimension?: number };

export const processImage = async (
  input: Buffer,
  {
    maxBytes = ASSET_LIMITS.maxBytes,
    maxDimension = ASSET_LIMITS.maxDimension,
  }: ProcessImageOptions = {},
): Promise<ProcessedImage> => {
  const mime = sniffImageType(input);

  if (!mime) throw new AppError(ErrorCode.ASSET_INVALID_TYPE, 415);

  try {
    const resized = sharp(input, { limitInputPixels: ASSET_LIMITS.maxInputPixels, failOn: "error" })
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      });

    const encoded =
      mime === "image/png"
        ? resized.png({ compressionLevel: 9 })
        : mime === "image/jpeg"
          ? resized.jpeg({ quality: 85, mozjpeg: true })
          : resized.webp({ quality: 85 });

    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });

    if (data.length > maxBytes) throw new AppError(ErrorCode.ASSET_TOO_LARGE, 413);

    return { data, mime, width: info.width, height: info.height };
  } catch (err) {
    if (err instanceof AppError) throw err;

    throw new AppError(ErrorCode.ASSET_INVALID_IMAGE, 400);
  }
};

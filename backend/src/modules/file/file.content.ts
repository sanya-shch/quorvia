import { ErrorCode, FILE_LIMITS, type FileMimeType } from "@quorvia/shared-types";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { processImage, sniffImageType } from "../asset/asset.image.js";

export type InspectedFile = { data: Buffer; mime: FileMimeType };

const IMAGE_ERROR_CODES: Record<string, string> = {
  [ErrorCode.ASSET_INVALID_TYPE]: ErrorCode.FILE_INVALID_TYPE,
  [ErrorCode.ASSET_INVALID_IMAGE]: ErrorCode.FILE_INVALID_CONTENT,
  [ErrorCode.ASSET_TOO_LARGE]: ErrorCode.FILE_TOO_LARGE,
};

const isPdf = (data: Buffer): boolean =>
  data.length >= 5 && data.subarray(0, 5).toString("latin1") === "%PDF-";

// Plain text means valid UTF-8 without NUL bytes or control characters other than tab/newline/
// carriage return. Anything binary fails one of the two, which keeps disguised executables out.
const isPlainText = (data: Buffer): boolean => {
  if (data.length === 0) return false;

  let text: string;

  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return false;
  }

  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text);
};

/**
 * Decides what an upload really is from its bytes (never from the name or the declared type) and
 * accepts only the allowlist. Images are decoded and re-encoded (metadata and appended data are
 * dropped, like for the logo). PDF and text are stored as they are: they cannot be sanitized, so
 * they are only ever served as downloads (see file.controller.ts).
 */
export const inspectFile = async (input: Buffer): Promise<InspectedFile> => {
  if (input.length === 0) throw new AppError(ErrorCode.FILE_INVALID_CONTENT, 400);
  if (input.length > FILE_LIMITS.maxBytes) throw new AppError(ErrorCode.FILE_TOO_LARGE, 413);

  if (sniffImageType(input)) {
    try {
      const image = await processImage(input, {
        maxBytes: FILE_LIMITS.maxBytes,
        maxDimension: FILE_LIMITS.maxImageDimension,
      });

      return { data: image.data, mime: image.mime };
    } catch (err) {
      if (err instanceof AppError) {
        throw new AppError(
          IMAGE_ERROR_CODES[err.message] ?? ErrorCode.FILE_INVALID_CONTENT,
          err.statusCode,
        );
      }

      throw err;
    }
  }

  if (isPdf(input)) return { data: input, mime: "application/pdf" };
  if (isPlainText(input)) return { data: input, mime: "text/plain" };

  throw new AppError(ErrorCode.FILE_INVALID_TYPE, 415);
};

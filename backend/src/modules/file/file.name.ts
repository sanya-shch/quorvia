import { FILE_LIMITS, type FileMimeType } from "@quorvia/shared-types";

const EXTENSIONS: Record<FileMimeType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/plain": "txt",
};

// Extensions that are fine for a type besides the canonical one.
const ACCEPTED_EXTENSIONS: Record<FileMimeType, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "text/plain": ["txt", "text", "log", "md", "csv"],
};

// multer decodes names as latin1; browsers send UTF-8. Undo that when the result is valid UTF-8.
const fixEncoding = (name: string): string => {
  // A name with characters above U+00FF was not produced by latin1 decoding: it is already text.
  if (/[^\u0000-\u00ff]/.test(name)) return name;

  const decoded = Buffer.from(name, "latin1").toString("utf8");

  return decoded.includes("\uFFFD") ? name : decoded;
};

/**
 * The name shown to the form owner and used for the download. It is display data only (the stored
 * object has a random name), but it still ends up in a header and in spreadsheets, so:
 * - no path parts, control characters or bidi overrides (a name like `photo\u202Egnp.exe`);
 * - a bounded length;
 * - the extension always matches what the bytes really are, so `invoice.pdf.exe` holding a PDF is
 *   shown as a PDF and an executable name cannot be kept.
 */
export const sanitizeFileName = (raw: string | undefined, mime: FileMimeType): string => {
  const canonical = EXTENSIONS[mime];
  let name = fixEncoding(raw ?? "");

  name = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff"<>:|?*]/g, "");
  name = name.replace(/^[.\s]+/, "").trim();

  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).trim();
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const keepExtension = ACCEPTED_EXTENSIONS[mime].includes(extension) ? extension : canonical;
  const maxBase = FILE_LIMITS.maxNameLength - keepExtension.length - 1;
  const safeBase = (base || "file").slice(0, maxBase).trim() || "file";

  return `${safeBase}.${keepExtension}`;
};

// Content-Disposition for a download: ASCII fallback plus the RFC 5987 UTF-8 form.
export const attachmentDisposition = (name: string): string => {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
};

export const contentTypeFor = (mime: string): string =>
  mime === "text/plain" ? "text/plain; charset=utf-8" : mime;

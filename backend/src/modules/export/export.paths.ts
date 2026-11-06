import path from "node:path";

// Directory of finished exports. The API serves files from here and the worker writes them here.
export const EXPORTS_DIR = path.join(process.cwd(), "uploads", "exports");

/**
 * Safely turns a file name stored in the DB into an absolute path inside the exports
 * directory. Returns null if the result escapes it (for example "../../etc/passwd"): the
 * name comes from the DB, but deleting and serving files must not rely on that value
 * always being honest.
 */
export const resolveExportPath = (filePath: string, dir: string = EXPORTS_DIR): string | null => {
  const root = path.resolve(dir);
  const absolute = path.resolve(root, filePath);

  return absolute.startsWith(root + path.sep) ? absolute : null;
};

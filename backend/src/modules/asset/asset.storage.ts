import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type StoredObject = { key: string; modifiedAt: Date };

/**
 * Where the bytes of uploaded images live. The rest of the code only knows this interface,
 * so an S3-compatible implementation can replace the disk later without touching the
 * service: keys are opaque names (`<uuid>.<ext>`), never paths.
 */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  // True if the object existed. A missing object is not an error.
  remove(key: string): Promise<boolean>;
  // Everything the storage holds, for the orphan sweep.
  list(): AsyncIterable<StoredObject>;
}

const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

export const extensionFor = (mime: keyof typeof EXTENSIONS): string => EXTENSIONS[mime];

export const newStorageKey = (mime: keyof typeof EXTENSIONS): string =>
  `${randomUUID()}.${extensionFor(mime)}`;

const KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|bin)$/;

// Respondent files are stored under a random name without any extension from the upload.
export const newBinaryStorageKey = (): string => `${randomUUID()}.bin`;

export const isStorageKey = (key: string): boolean => KEY_PATTERN.test(key);

/**
 * Files in one directory. Keys are validated against a strict pattern, so a value that
 * ever came from the DB or a request cannot escape the root (no separators, no dots).
 */
export class DiskStorage implements Storage {
  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    if (!isStorageKey(key)) throw new Error(`Invalid storage key: ${key}`);

    return path.join(this.root, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await fs.mkdir(this.root, { recursive: true });

    // Write under a temporary name and rename, so a reader never sees a half-written
    // file (the temporary name does not match the key pattern, so the sweep ignores it).
    const temporary = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, data, { flag: "wx" });
    await fs.rename(temporary, target);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async remove(key: string): Promise<boolean> {
    try {
      await fs.unlink(this.pathFor(key));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw err;
    }
  }

  async *list(): AsyncIterable<StoredObject> {
    let names: string[];

    try {
      names = await fs.readdir(this.root);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    for (const key of names) {
      if (!isStorageKey(key)) continue;

      const stat = await fs.stat(path.join(this.root, key));
      if (stat.isFile()) yield { key, modifiedAt: stat.mtime };
    }
  }
}

// Where the API and the worker keep uploaded images (next to the exports directory).
export const ASSETS_DIR = path.join(process.cwd(), "uploads", "assets");

export const defaultStorage: Storage = new DiskStorage(ASSETS_DIR);

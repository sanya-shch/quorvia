import path from "node:path";
import { DiskStorage, type Storage } from "../asset/asset.storage.js";

// Respondent uploads live apart from the owner's images: a different directory, never served from
// a public route, and every object has a random name (see newBinaryStorageKey).
export const FILES_DIR = path.join(process.cwd(), "uploads", "files");

export const defaultFileStorage: Storage = new DiskStorage(FILES_DIR);

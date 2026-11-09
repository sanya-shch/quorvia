import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DiskStorage, isStorageKey, newStorageKey } from "./asset.storage.js";

let dir: string;
let storage: DiskStorage;

const keysOf = async () => {
  const keys: string[] = [];
  for await (const object of storage.list()) keys.push(object.key);
  return keys.sort();
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "assets-"));
  storage = new DiskStorage(path.join(dir, "nested", "assets"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("storage keys", () => {
  it("generates a uuid plus an extension for the mime type", () => {
    expect(newStorageKey("image/png")).toMatch(/\.png$/);
    expect(newStorageKey("image/jpeg")).toMatch(/\.jpg$/);
    expect(newStorageKey("image/webp")).toMatch(/\.webp$/);
    expect(isStorageKey(newStorageKey("image/png"))).toBe(true);
  });

  it.each(["../etc/passwd", "a/b.png", "x.png", "11111111-1111-4111-8111-111111111111.svg", ""])(
    "rejects %j as a key",
    (key) => {
      expect(isStorageKey(key)).toBe(false);
    },
  );
});

describe("DiskStorage", () => {
  it("stores and returns bytes, creating the directory on demand", async () => {
    const key = newStorageKey("image/png");

    await storage.put(key, Buffer.from("bytes"));

    expect((await storage.get(key))?.toString()).toBe("bytes");
  });

  it("returns null for a missing object and false when removing it", async () => {
    const key = newStorageKey("image/png");

    expect(await storage.get(key)).toBeNull();
    expect(await storage.remove(key)).toBe(false);
  });

  it("removes an existing object", async () => {
    const key = newStorageKey("image/png");
    await storage.put(key, Buffer.from("x"));

    expect(await storage.remove(key)).toBe(true);
    expect(await storage.get(key)).toBeNull();
  });

  it("never touches paths outside the root", async () => {
    await expect(storage.put("../escape.png", Buffer.from("x"))).rejects.toThrow(
      "Invalid storage key",
    );
    await expect(storage.get("../../etc/passwd")).rejects.toThrow("Invalid storage key");
    await expect(storage.remove("../x.png")).rejects.toThrow("Invalid storage key");
  });

  it("lists only keys, skipping foreign files and temporary leftovers", async () => {
    const key = newStorageKey("image/webp");
    await storage.put(key, Buffer.from("x"));
    const root = path.join(dir, "nested", "assets");
    await fs.writeFile(path.join(root, "notes.txt"), "x");
    await fs.writeFile(path.join(root, `${key}.1234.tmp`), "x");

    expect(await keysOf()).toEqual([key]);
  });

  it("lists nothing when the directory does not exist yet", async () => {
    expect(await keysOf()).toEqual([]);
  });
});

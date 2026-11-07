import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ASSET_LIMITS, ErrorCode } from "@quorvia/shared-types";

// The asset flow on a REAL Prisma + Postgres (PGlite with the project's migrations) and real
// files in a temp directory: upload, ownership, quota, attaching the logo, deleting a form
// and the orphan sweep.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

// Everything that uses the default storage (form deletion included) gets a temp directory.
const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "assets-int-"));

vi.mock("./asset.storage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./asset.storage.js")>();

  return { ...actual, defaultStorage: new actual.DiskStorage(storageDir) };
});

const { prisma } = await import("../../prisma/prisma.js");
const { defaultStorage: storage, newStorageKey } = await import("./asset.storage.js");
const { uploadAsset, getAssetContent } = await import("./asset.service.js");
const { updateForm, getFormByShareId, deleteForm } = await import("../form/form.service.js");
const { cleanupOrphanAssets } = await import("../maintenance/maintenance.service.js");
const { makePng, makeJpeg } = await import("./testImages.js");

const OWNER = "user-1";
const OTHER = "user-2";
const FORM = "form-1";
const OTHER_FORM = "form-2";
const DAY_MS = 24 * 60 * 60 * 1000;

const keysOf = async () => {
  const keys: string[] = [];
  for await (const object of storage.list()) keys.push(object.key);
  return keys.sort();
};

const rejectsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ message: code });

const save = (data: Record<string, unknown>) =>
  updateForm(FORM, OWNER, { title: "Form", questions: [], ...data } as never);

beforeEach(async () => {
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.createMany({
    data: [
      { id: OWNER, email: "a@b.c", password: "x" },
      { id: OTHER, email: "d@e.f", password: "x" },
    ],
  });
  await prisma.form.create({ data: { id: FORM, title: "Form", userId: OWNER, shareId: "share-1", isPublished: true } });
  await prisma.form.create({ data: { id: OTHER_FORM, title: "Other", userId: OTHER, shareId: "share-2" } });
});

afterEach(async () => {
  for (const key of await keysOf()) await storage.remove(key);
});

afterAll(async () => {
  await prisma.$disconnect();
  await fs.rm(storageDir, { recursive: true, force: true });
});

describe("uploadAsset", () => {
  it("stores a re-encoded file and a row that describes it", async () => {
    const input = await makePng(40, 20);
    const dto = await uploadAsset(FORM, OWNER, "LOGO", input);

    expect(dto).toMatchObject({ kind: "LOGO", mime: "image/png", width: 40, height: 20 });

    const row = await prisma.asset.findUniqueOrThrow({ where: { id: dto.id } });
    const stored = await storage.get(row.storageKey);

    expect(row.formId).toBe(FORM);
    expect(stored).not.toBeNull();
    expect(stored!.length).toBe(dto.size);
    expect((await sharp(stored!).metadata()).format).toBe("png");
  });

  it("never stores the uploaded bytes themselves", async () => {
    const payload = Buffer.from("<script>evil()</script>");
    const dto = await uploadAsset(FORM, OWNER, "LOGO", Buffer.concat([await makePng(), payload]));

    const row = await prisma.asset.findUniqueOrThrow({ where: { id: dto.id } });

    expect((await storage.get(row.storageKey))!.includes(payload)).toBe(false);
  });

  it("404 for an unknown form, 403 for someone else's form", async () => {
    await rejectsWith(uploadAsset("missing", OWNER, "LOGO", await makePng()), ErrorCode.FORM_NOT_FOUND);
    await rejectsWith(uploadAsset(OTHER_FORM, OWNER, "LOGO", await makePng()), ErrorCode.FORM_FORBIDDEN);

    expect(await prisma.asset.count()).toBe(0);
    expect(await keysOf()).toEqual([]);
  });

  it("leaves neither a row nor a file after an invalid upload", async () => {
    await rejectsWith(
      uploadAsset(FORM, OWNER, "LOGO", Buffer.from("<svg><script/></svg>")),
      ErrorCode.ASSET_INVALID_TYPE,
    );

    expect(await prisma.asset.count()).toBe(0);
    expect(await keysOf()).toEqual([]);
  });

  it("stops at the per-form quota", async () => {
    await prisma.asset.createMany({
      data: Array.from({ length: ASSET_LIMITS.maxPerForm }, (_, i) => ({
        formId: FORM,
        kind: "LOGO" as const,
        mime: "image/png",
        size: 1,
        width: 1,
        height: 1,
        storageKey: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}.png`,
      })),
    });

    await rejectsWith(uploadAsset(FORM, OWNER, "LOGO", await makePng()), ErrorCode.ASSET_LIMIT_REACHED);
    expect(await keysOf()).toEqual([]);
  });

  it("removes the file again when the row cannot be written", async () => {
    const spy = vi.spyOn(prisma.asset, "create").mockRejectedValueOnce(new Error("db down"));

    await expect(uploadAsset(FORM, OWNER, "LOGO", await makePng())).rejects.toThrow("db down");

    spy.mockRestore();
    expect(await keysOf()).toEqual([]);
  });
});

describe("getAssetContent", () => {
  it("returns the stored bytes and the type recorded by the server", async () => {
    const dto = await uploadAsset(FORM, OWNER, "LOGO", await makeJpeg());
    const content = await getAssetContent(dto.id);

    expect(content.mime).toBe("image/jpeg");
    expect((await sharp(content.data).metadata()).format).toBe("jpeg");
  });

  it("404 for an unknown id and for a row whose file is gone", async () => {
    await rejectsWith(getAssetContent("nope"), ErrorCode.ASSET_NOT_FOUND);

    const dto = await uploadAsset(FORM, OWNER, "LOGO", await makePng());
    const row = await prisma.asset.findUniqueOrThrow({ where: { id: dto.id } });
    await storage.remove(row.storageKey);

    await rejectsWith(getAssetContent(dto.id), ErrorCode.ASSET_NOT_FOUND);
  });
});

describe("the form logo", () => {
  it("is attached through updateForm and shows up in the public form", async () => {
    const dto = await uploadAsset(FORM, OWNER, "LOGO", await makePng());

    await save({ logoAssetId: dto.id });

    expect((await getFormByShareId("share-1")).logoAssetId).toBe(dto.id);
  });

  it("is left alone when logoAssetId is omitted and removed by null", async () => {
    const dto = await uploadAsset(FORM, OWNER, "LOGO", await makePng());
    await save({ logoAssetId: dto.id });

    await save({});
    expect((await getFormByShareId("share-1")).logoAssetId).toBe(dto.id);

    await save({ logoAssetId: null });
    expect((await getFormByShareId("share-1")).logoAssetId).toBeNull();
  });

  it("cannot point at an unknown asset or at an asset of another form", async () => {
    const foreign = await uploadAsset(OTHER_FORM, OTHER, "LOGO", await makePng());

    await rejectsWith(save({ logoAssetId: foreign.id }), ErrorCode.ASSET_NOT_FOUND);
    await rejectsWith(save({ logoAssetId: "11111111-1111-4111-8111-111111111111" }), ErrorCode.ASSET_NOT_FOUND);
    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).logoAssetId).toBeNull();
  });
});

describe("deleteForm", () => {
  it("removes the images of the form together with their files", async () => {
    const dto = await uploadAsset(FORM, OWNER, "LOGO", await makePng());
    await save({ logoAssetId: dto.id });
    const other = await uploadAsset(OTHER_FORM, OTHER, "LOGO", await makePng());

    await deleteForm(FORM, OWNER);

    expect(await prisma.asset.findMany({ select: { id: true } })).toEqual([{ id: other.id }]);
    expect(await keysOf()).toHaveLength(1);
  });
});

describe("cleanupOrphanAssets", () => {
  const NOW = new Date();
  const age = (ms: number) => new Date(NOW.getTime() - ms);

  const makeAsset = async (createdAgo: number) => {
    const dto = await uploadAsset(FORM, OWNER, "LOGO", await makePng());
    await prisma.asset.update({ where: { id: dto.id }, data: { createdAt: age(createdAgo) } });
    return prisma.asset.findUniqueOrThrow({ where: { id: dto.id } });
  };

  it("removes old unused images with their files, keeps the logo and fresh uploads", async () => {
    const oldUnused = await makeAsset(3 * DAY_MS);
    const oldLogo = await makeAsset(3 * DAY_MS);
    const fresh = await makeAsset(60 * 1000);
    await save({ logoAssetId: oldLogo.id });

    const result = await cleanupOrphanAssets({ now: NOW });

    expect(result).toMatchObject({ rows: 1 });
    expect((await prisma.asset.findMany({ select: { id: true } })).map((a) => a.id).sort()).toEqual(
      [oldLogo.id, fresh.id].sort(),
    );
    expect(await storage.get(oldUnused.storageKey)).toBeNull();
    expect(await storage.get(oldLogo.storageKey)).not.toBeNull();
    expect(await storage.get(fresh.storageKey)).not.toBeNull();
  });

  it("removes a replaced logo once the grace period has passed", async () => {
    const first = await makeAsset(3 * DAY_MS);
    const second = await makeAsset(3 * DAY_MS);

    await save({ logoAssetId: first.id });
    await save({ logoAssetId: second.id });
    await cleanupOrphanAssets({ now: NOW });

    expect(await prisma.asset.findUnique({ where: { id: first.id } })).toBeNull();
    expect(await prisma.asset.findUnique({ where: { id: second.id } })).not.toBeNull();
  });

  it("removes old files without a row but not fresh ones", async () => {
    const oldKey = newStorageKey("image/png");
    const freshKey = newStorageKey("image/png");
    await storage.put(oldKey, Buffer.from("x"));
    await storage.put(freshKey, Buffer.from("x"));
    // storageDir is a real directory: age the first file through its mtime.
    await fs.utimes(path.join(storageDir, oldKey), age(3 * DAY_MS), age(3 * DAY_MS));

    const result = await cleanupOrphanAssets({ now: NOW });

    expect(result.files).toBe(1);
    expect(await keysOf()).toEqual([freshKey]);
  });

  it("works in batches", async () => {
    for (let i = 0; i < 5; i++) await makeAsset(3 * DAY_MS);

    const result = await cleanupOrphanAssets({ now: NOW, batchSize: 2 });

    expect(result.rows).toBe(5);
    expect(await prisma.asset.count()).toBe(0);
    expect(await keysOf()).toEqual([]);
  });
});

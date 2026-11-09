import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ErrorCode } from "@quorvia/shared-types";

// IMAGE_CHOICE end to end on a REAL Prisma + Postgres (PGlite) and real files: saving options with
// pictures, answering, analytics, duplicating a form and the orphan sweep.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-choice-"));

vi.mock("./asset.storage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./asset.storage.js")>();

  return { ...actual, defaultStorage: new actual.DiskStorage(storageDir) };
});

const { prisma } = await import("../../prisma/prisma.js");
const { defaultStorage: storage } = await import("./asset.storage.js");
const { uploadAsset } = await import("./asset.service.js");
const { updateForm, getFormByShareId, duplicateForm, deleteForm } =
  await import("../form/form.service.js");
const { submitResponse } = await import("../response/response.service.js");
const { getFormAnalytics, getQuestionAnalytics } =
  await import("../analytics/analytics.service.js");
const { cleanupOrphanAssets } = await import("../maintenance/maintenance.service.js");
const { makePng } = await import("./testImages.js");

const OWNER = "user-1";
const OTHER = "user-2";
const FORM = "form-1";
const OTHER_FORM = "form-2";
const Q = "q-image";
const DAY_MS = 24 * 60 * 60 * 1000;

const keysOf = async () => {
  const keys: string[] = [];
  for await (const object of storage.list()) keys.push(object.key);
  return keys.sort();
};

const rejectsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ message: code });

const imageQuestion = (options: { id: string; text: string; imageAssetId?: string | null }[]) => ({
  id: Q,
  text: "Pick a picture",
  type: "IMAGE_CHOICE" as const,
  order: 0,
  required: true,
  options: options.map((o) => ({ isDefault: false, ...o })),
});

const save = (questions: unknown[], extra: Record<string, unknown> = {}) =>
  updateForm(FORM, OWNER, { title: "Form", questions, ...extra } as never);

const upload = (formId: string, userId: string, kind: "LOGO" | "OPTION_IMAGE") =>
  makePng().then((png) => uploadAsset(formId, userId, kind, png));

const publicOptions = async () => {
  const form = await getFormByShareId("share-1");
  return (form.questions[0]!.options ?? []) as {
    id: string;
    text: string;
    imageAssetId?: string;
  }[];
};

beforeEach(async () => {
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.createMany({
    data: [
      { id: OWNER, email: "a@b.c", password: "x" },
      { id: OTHER, email: "d@e.f", password: "x" },
    ],
  });
  await prisma.form.create({
    data: { id: FORM, title: "Form", userId: OWNER, shareId: "share-1", isPublished: true },
  });
  await prisma.form.create({
    data: { id: OTHER_FORM, title: "Other", userId: OTHER, shareId: "share-2" },
  });
});

afterEach(async () => {
  for (const key of await keysOf()) await storage.remove(key);
});

afterAll(async () => {
  await prisma.$disconnect();
  await fs.rm(storageDir, { recursive: true, force: true });
});

describe("saving an IMAGE_CHOICE question", () => {
  it("stores the pictures of the options and returns them in the public form", async () => {
    const red = await upload(FORM, OWNER, "OPTION_IMAGE");
    const blue = await upload(FORM, OWNER, "OPTION_IMAGE");

    await save([
      imageQuestion([
        { id: "a", text: "Red", imageAssetId: red.id },
        { id: "b", text: "Blue", imageAssetId: blue.id },
        { id: "c", text: "No picture" },
      ]),
    ]);

    expect(await publicOptions()).toMatchObject([
      { id: "a", imageAssetId: red.id },
      { id: "b", imageAssetId: blue.id },
      { id: "c", text: "No picture" },
    ]);
  });

  it("rejects a picture that belongs to another form", async () => {
    const foreign = await upload(OTHER_FORM, OTHER, "OPTION_IMAGE");

    await rejectsWith(
      save([
        imageQuestion([
          { id: "a", text: "A", imageAssetId: foreign.id },
          { id: "b", text: "B" },
        ]),
      ]),
      ErrorCode.ASSET_NOT_FOUND,
    );
    expect(await prisma.question.count({ where: { formId: FORM } })).toBe(0);
  });

  it("rejects an unknown picture and a logo used as an option picture", async () => {
    const logo = await upload(FORM, OWNER, "LOGO");

    for (const imageAssetId of ["11111111-1111-4111-8111-111111111111", logo.id]) {
      await rejectsWith(
        save([
          imageQuestion([
            { id: "a", text: "A", imageAssetId },
            { id: "b", text: "B" },
          ]),
        ]),
        ErrorCode.ASSET_NOT_FOUND,
      );
    }
  });

  it("does not check pictures on other question types", async () => {
    // Only IMAGE_CHOICE options carry pictures; stray keys elsewhere are not references.
    await save([
      {
        id: "q-single",
        text: "Single",
        type: "CHOICE_SINGLE",
        order: 0,
        required: false,
        options: [
          { id: "a", text: "A", isDefault: false },
          { id: "b", text: "B", isDefault: false },
        ],
      },
    ]);

    expect(await prisma.question.count({ where: { formId: FORM } })).toBe(1);
  });
});

describe("answering and analytics", () => {
  const options = [
    { id: "a", text: "Red" },
    { id: "b", text: "Blue" },
  ];

  beforeEach(async () => {
    await save([imageQuestion(options)]);
  });

  it("accepts one of the option ids and rejects anything else", async () => {
    await expect(submitResponse("share-1", { [Q]: "a" })).resolves.toBeDefined();

    await expect(submitResponse("share-1", { [Q]: "zzz" })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(submitResponse("share-1", { [Q]: ["a"] })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(submitResponse("share-1", {})).rejects.toMatchObject({ statusCode: 400 });
  });

  it("counts the answers per option", async () => {
    await submitResponse("share-1", { [Q]: "a" });
    await submitResponse("share-1", { [Q]: "a" });
    await submitResponse("share-1", { [Q]: "b" });

    const overview = await getFormAnalytics(FORM, OWNER);
    const detail = await getQuestionAnalytics(FORM, Q, OWNER);

    expect(JSON.stringify(overview)).toContain("IMAGE_CHOICE");
    expect(detail).toMatchObject({ question: { type: "IMAGE_CHOICE" }, totalAnswers: 3 });

    if (!("distribution" in detail)) throw new Error("unreachable");

    expect(
      detail.distribution.map((d) => ["optionId" in d ? d.optionId : d.value, d.count]),
    ).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});

describe("duplicateForm", () => {
  it("gives the copy its own logo and option pictures, files included", async () => {
    const logo = await upload(FORM, OWNER, "LOGO");
    const picture = await upload(FORM, OWNER, "OPTION_IMAGE");
    await save(
      [
        imageQuestion([
          { id: "a", text: "A", imageAssetId: picture.id },
          { id: "b", text: "B" },
        ]),
      ],
      { logoAssetId: logo.id },
    );

    const copy = await duplicateForm(FORM, OWNER);

    const copyForm = await prisma.form.findUniqueOrThrow({
      where: { id: copy.id },
      include: { questions: true, assets: true },
    });
    const copyOptions = copyForm.questions[0]!.options as { id: string; imageAssetId?: string }[];

    expect(copyForm.assets).toHaveLength(2);
    expect(copyForm.logoAssetId).not.toBeNull();
    expect(copyForm.logoAssetId).not.toBe(logo.id);
    expect(copyOptions[0]!.imageAssetId).not.toBe(picture.id);
    expect(copyForm.assets.map((a) => a.id)).toContain(copyOptions[0]!.imageAssetId);
    // Two originals and two copies, none shared.
    expect(await keysOf()).toHaveLength(4);
    expect(new Set(copyForm.assets.map((a) => a.storageKey)).size).toBe(2);
  });

  it("keeps the copy intact when the original is deleted", async () => {
    const picture = await upload(FORM, OWNER, "OPTION_IMAGE");
    await save([
      imageQuestion([
        { id: "a", text: "A", imageAssetId: picture.id },
        { id: "b", text: "B" },
      ]),
    ]);
    const copy = await duplicateForm(FORM, OWNER);

    await deleteForm(FORM, OWNER);

    const copyAssets = await prisma.asset.findMany({ where: { formId: copy.id } });

    expect(copyAssets).toHaveLength(1);
    expect(await storage.get(copyAssets[0]!.storageKey)).not.toBeNull();
    expect(await keysOf()).toHaveLength(1);
  });

  it("the copy can be saved again (its pictures are its own assets)", async () => {
    const picture = await upload(FORM, OWNER, "OPTION_IMAGE");
    await save([
      imageQuestion([
        { id: "a", text: "A", imageAssetId: picture.id },
        { id: "b", text: "B" },
      ]),
    ]);
    const copy = await duplicateForm(FORM, OWNER);
    const stored = await prisma.question.findFirstOrThrow({ where: { formId: copy.id } });

    await expect(
      updateForm(copy.id, OWNER, {
        title: "Copy",
        questions: [{ ...imageQuestion([]), id: stored.id, options: stored.options }],
      } as never),
    ).resolves.toBeDefined();
  });

  it("drops the picture of an option whose file is missing", async () => {
    const picture = await upload(FORM, OWNER, "OPTION_IMAGE");
    await save([
      imageQuestion([
        { id: "a", text: "A", imageAssetId: picture.id },
        { id: "b", text: "B" },
      ]),
    ]);
    const row = await prisma.asset.findUniqueOrThrow({ where: { id: picture.id } });
    await storage.remove(row.storageKey);

    const copy = await duplicateForm(FORM, OWNER);
    const stored = await prisma.question.findFirstOrThrow({ where: { formId: copy.id } });

    expect((stored.options as { imageAssetId: string | null }[])[0]!.imageAssetId).toBeNull();
  });
});

describe("cleanupOrphanAssets with option pictures", () => {
  const NOW = new Date();

  const ageAsset = (id: string, ms: number) =>
    prisma.asset.update({ where: { id }, data: { createdAt: new Date(NOW.getTime() - ms) } });

  it("keeps a picture an option still uses and removes one that nothing references", async () => {
    const used = await upload(FORM, OWNER, "OPTION_IMAGE");
    const unused = await upload(FORM, OWNER, "OPTION_IMAGE");
    await save([
      imageQuestion([
        { id: "a", text: "A", imageAssetId: used.id },
        { id: "b", text: "B" },
      ]),
    ]);
    await ageAsset(used.id, 3 * DAY_MS);
    await ageAsset(unused.id, 3 * DAY_MS);

    const result = await cleanupOrphanAssets({ now: NOW });

    expect(result.rows).toBe(1);
    expect(await prisma.asset.findUnique({ where: { id: used.id } })).not.toBeNull();
    expect(await prisma.asset.findUnique({ where: { id: unused.id } })).toBeNull();
    expect(await keysOf()).toHaveLength(1);
  });

  it("removes a picture once the option that used it is gone", async () => {
    const picture = await upload(FORM, OWNER, "OPTION_IMAGE");
    await save([
      imageQuestion([
        { id: "a", text: "A", imageAssetId: picture.id },
        { id: "b", text: "B" },
      ]),
    ]);
    await save([
      imageQuestion([
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ]),
    ]);
    await ageAsset(picture.id, 3 * DAY_MS);

    await cleanupOrphanAssets({ now: NOW });

    expect(await prisma.asset.findUnique({ where: { id: picture.id } })).toBeNull();
  });

  it("walks past kept assets in batches without stopping early", async () => {
    const pictures = [];
    for (let i = 0; i < 4; i++) pictures.push(await upload(FORM, OWNER, "OPTION_IMAGE"));
    const orphans = [];
    for (let i = 0; i < 4; i++) orphans.push(await upload(FORM, OWNER, "OPTION_IMAGE"));
    await save([
      imageQuestion(
        pictures.slice(0, 2).map((p, i) => ({ id: `o${i}`, text: `O${i}`, imageAssetId: p.id })),
      ),
    ]);
    for (const asset of [...pictures, ...orphans]) await ageAsset(asset.id, 3 * DAY_MS);

    // The two referenced pictures are kept; the six others (two unreferenced pictures and four
    // orphans) go, although each batch of two starts with kept assets.
    const result = await cleanupOrphanAssets({ now: NOW, batchSize: 2 });

    expect(result.rows).toBe(6);
    expect(await prisma.asset.count()).toBe(2);
  });
});

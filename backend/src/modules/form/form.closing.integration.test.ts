import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ErrorCode } from "@quorvia/shared-types";

// Closing a form on a REAL Prisma + Postgres (PGlite with the project's migrations): the response
// counter, the limit, the date, the public answer for a closed form, and the places that must stop
// accepting data (submit, autosave, uploads).
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "closing-"));

vi.mock("../file/file.storage.js", async () => {
  const { DiskStorage } = await import("../asset/asset.storage.js");

  return { defaultFileStorage: new DiskStorage(storageDir), FILES_DIR: storageDir };
});

const { prisma } = await import("../../prisma/prisma.js");
const { updateForm, getFormByShareId, getPublicForm, getUserForm, duplicateForm } =
  await import("./form.service.js");
const { submitResponse } = await import("../response/response.service.js");
const { claimResponseSlot } = await import("./form.closing.js");
const { saveAttempt } = await import("../attempt/attempt.service.js");
const { uploadResponseFile } = await import("../file/file.service.js");

const OWNER = "user-1";
const FORM = "form-1";
const SHARE = "share-1";
const Q = "q-name";
const HOUR_MS = 60 * 60 * 1000;

const keysOf = async () => (await fs.readdir(storageDir).catch(() => [])).length;

const question = (extra: Record<string, unknown> = {}) => ({
  id: Q,
  text: "Name",
  type: "TEXT" as const,
  order: 0,
  required: true,
  config: { variant: "input" },
  ...extra,
});

const save = (data: Record<string, unknown> = {}, questions: unknown[] = [question()]) =>
  updateForm(FORM, OWNER, { title: "Form", questions, ...data } as never);

const submit = (value = "Ira", sessionKey?: string) =>
  submitResponse(SHARE, { [Q]: value }, sessionKey);

const counts = async () => ({
  responseCount: (await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).responseCount,
  responses: await prisma.response.count({ where: { formId: FORM } }),
});

const rejectsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ statusCode: 410, message: code });

beforeEach(async () => {
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: OWNER, email: "a@b.c", password: "x" } });
  await prisma.form.create({
    data: { id: FORM, title: "Form", userId: OWNER, shareId: SHARE, isPublished: true },
  });
  await save();
});

afterEach(async () => {
  for (const name of await fs.readdir(storageDir).catch(() => [])) {
    await fs.rm(path.join(storageDir, name), { force: true });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
  await fs.rm(storageDir, { recursive: true, force: true });
});

describe("the response counter", () => {
  it("starts at zero and follows the number of submitted responses", async () => {
    expect(await counts()).toEqual({ responseCount: 0, responses: 0 });

    await submit();
    await submit();

    expect(await counts()).toEqual({ responseCount: 2, responses: 2 });
  });

  it("is not consumed by a response that fails validation", async () => {
    await expect(submitResponse(SHARE, {})).rejects.toMatchObject({ statusCode: 400 });

    expect(await counts()).toEqual({ responseCount: 0, responses: 0 });
  });

  it("is rolled back together with the response when attaching a file fails", async () => {
    await save({}, [
      question({ required: false }),
      {
        id: "q-file",
        text: "File",
        type: "FILE",
        order: 1,
        required: false,
        config: { maxFiles: 1 },
      },
    ]);

    await expect(
      submitResponse(
        SHARE,
        { [Q]: "Ira", "q-file": ["11111111-aaaa-4bbb-8ccc-111111111111"] },
        "session-1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(await counts()).toEqual({ responseCount: 0, responses: 0 });
  });

  it("is shown to the owner with the form", async () => {
    await submit();

    expect(await getUserForm(FORM, OWNER)).toMatchObject({ responseCount: 1 });
  });

  it("is started from the real number of responses for forms that existed before (migration)", async () => {
    await prisma.response.createMany({
      data: [1, 2, 3].map(() => ({ formId: FORM, answers: {}, visibleQuestionIds: [] })),
    });
    await prisma.form.update({ where: { id: FORM }, data: { responseCount: 0 } });

    // The backfill statement of the migration itself.
    const migration = await fs.readFile(
      path.resolve(
        import.meta.dirname,
        "../../../prisma/migrations/20261112000000_add_form_closing/migration.sql",
      ),
      "utf8",
    );
    const backfill = migration.slice(migration.indexOf("UPDATE"));
    await prisma.$executeRawUnsafe(backfill);

    expect((await counts()).responseCount).toBe(3);
  });
});

describe("closing by the number of responses", () => {
  beforeEach(async () => {
    await save({ maxResponses: 2 });
  });

  it("accepts responses up to the limit and refuses the next one", async () => {
    await submit();
    await submit();

    await rejectsWith(submit(), ErrorCode.FORM_CLOSED_BY_LIMIT);

    expect(await counts()).toEqual({ responseCount: 2, responses: 2 });
  });

  it("never lets simultaneous submits exceed the limit (no 101st response)", async () => {
    await save({ maxResponses: 3 });

    const results = await Promise.allSettled(Array.from({ length: 10 }, () => submit()));

    const accepted = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected");

    expect(accepted).toHaveLength(3);
    expect(refused).toHaveLength(7);
    for (const r of refused) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({
        message: ErrorCode.FORM_CLOSED_BY_LIMIT,
      });
    }
    expect(await counts()).toEqual({ responseCount: 3, responses: 3 });
  });

  it("reopens when the author raises the limit and closes at once when it is lowered", async () => {
    await submit();
    await submit();
    await rejectsWith(submit(), ErrorCode.FORM_CLOSED_BY_LIMIT);

    await save({ maxResponses: 3 });
    await expect(submit()).resolves.toBeDefined();

    await save({ maxResponses: 1 });
    await rejectsWith(submit(), ErrorCode.FORM_CLOSED_BY_LIMIT);
  });

  it("stops limiting once the limit is removed with null", async () => {
    await submit();
    await submit();

    await save({ maxResponses: null });

    await expect(submit()).resolves.toBeDefined();
  });

  it("is left alone when the field is omitted", async () => {
    await save({});

    expect((await getUserForm(FORM, OWNER)).maxResponses).toBe(2);
  });
});

describe("closing by a date", () => {
  it("accepts answers before the moment and refuses them after it", async () => {
    await save({ closesAt: new Date(Date.now() + HOUR_MS).toISOString() });
    await expect(submit()).resolves.toBeDefined();

    await save({ closesAt: new Date(Date.now() - 1000).toISOString() });
    await rejectsWith(submit(), ErrorCode.FORM_CLOSED_BY_DATE);

    expect(await counts()).toEqual({ responseCount: 1, responses: 1 });
  });

  it("is stored as an instant, whatever offset it was sent with", async () => {
    await save({ closesAt: "2030-01-01T12:00:00+02:00" });

    expect((await getUserForm(FORM, OWNER)).closesAt?.toISOString()).toBe(
      "2030-01-01T10:00:00.000Z",
    );
  });

  it("is removed with null and left alone when omitted", async () => {
    await save({ closesAt: new Date(Date.now() + HOUR_MS).toISOString() });
    await save({});
    expect((await getUserForm(FORM, OWNER)).closesAt).not.toBeNull();

    await save({ closesAt: null });
    expect((await getUserForm(FORM, OWNER)).closesAt).toBeNull();
  });

  it("names the date when both rules have closed the form", async () => {
    await save({ maxResponses: 1, closesAt: new Date(Date.now() - 1000).toISOString() });
    await prisma.form.update({ where: { id: FORM }, data: { responseCount: 5 } });

    await rejectsWith(submit(), ErrorCode.FORM_CLOSED_BY_DATE);
  });
});

describe("the public form", () => {
  it("is the full form while it is open", async () => {
    const form = await getPublicForm(SHARE);

    expect(form).toHaveProperty("questions");
    expect(form).not.toHaveProperty("closedReason");
  });

  it("answers a form closed by date with the reason, branding and no questions", async () => {
    await save({
      closesAt: new Date(Date.now() - 1000).toISOString(),
      languages: ["en"],
      translations: { en: { title: "Closed form" } },
      theme: { mode: "dark" },
    });

    const form = await getPublicForm(SHARE);

    expect(form).toMatchObject({
      closedReason: "DATE",
      id: FORM,
      title: "Form",
      defaultLanguage: "uk",
      languages: ["en"],
      theme: { mode: "dark" },
      translations: { en: { title: "Closed form" } },
    });
    expect(form).not.toHaveProperty("questions");
    expect(form).not.toHaveProperty("responseMode");
  });

  it("answers a form closed by the limit with its reason", async () => {
    await save({ maxResponses: 1 });
    await submit();

    expect(await getPublicForm(SHARE)).toMatchObject({ closedReason: "LIMIT" });
  });

  it("reveals nothing about the owner or the answers", async () => {
    await save({ maxResponses: 1 });
    await submit();

    const form = await getPublicForm(SHARE);
    const keys = Object.keys(form).sort();

    expect(keys).toEqual(
      [
        "closedReason",
        "defaultLanguage",
        "description",
        "id",
        "languages",
        "logoAssetId",
        "theme",
        "title",
        "translations",
      ].sort(),
    );
  });

  it("still answers 404 for an unpublished form, closed or not", async () => {
    await prisma.form.update({ where: { id: FORM }, data: { isPublished: false } });

    await expect(getPublicForm(SHARE)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getPublicForm("missing")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("is refused with 410 by the strict reader used for filling in", async () => {
    await save({ maxResponses: 1 });
    await submit();

    await rejectsWith(getFormByShareId(SHARE), ErrorCode.FORM_CLOSED_BY_LIMIT);
  });
});

describe("autosave and uploads on a closed form", () => {
  it("records drafts while the form is open", async () => {
    await expect(saveAttempt(SHARE, "session-1", { [Q]: "Ir" })).resolves.toBeDefined();
  });

  it("stops recording drafts once the form has closed", async () => {
    await save({ maxResponses: 1 });
    await submit();

    await rejectsWith(
      saveAttempt(SHARE, "session-2", { [Q]: "Ir" }),
      ErrorCode.FORM_CLOSED_BY_LIMIT,
    );
    expect(await prisma.responseAttempt.count({ where: { sessionKey: "session-2" } })).toBe(0);

    await save({ maxResponses: 99, closesAt: new Date(Date.now() - 1000).toISOString() });
    await rejectsWith(
      saveAttempt(SHARE, "session-3", { [Q]: "Ir" }),
      ErrorCode.FORM_CLOSED_BY_DATE,
    );
  });

  it("refuses file uploads to a closed form and stores nothing", async () => {
    await save({ closesAt: new Date(Date.now() + HOUR_MS).toISOString() }, [
      question({ required: false }),
      {
        id: "q-file",
        text: "File",
        type: "FILE",
        order: 1,
        required: false,
        config: { maxFiles: 1 },
      },
    ]);
    const input = {
      shareId: SHARE,
      sessionKey: "session-1",
      questionId: "q-file",
      rawName: "a.txt",
      data: Buffer.from("hello"),
    };

    await expect(uploadResponseFile(input)).resolves.toBeDefined();

    await prisma.form.update({
      where: { id: FORM },
      data: { closesAt: new Date(Date.now() - 1000) },
    });
    await rejectsWith(
      uploadResponseFile({ ...input, sessionKey: "session-2" }),
      ErrorCode.FORM_CLOSED_BY_DATE,
    );

    expect(await keysOf()).toBe(1);
  });
});

describe("duplicateForm", () => {
  it("starts the copy open with an empty counter and no limits", async () => {
    await save({ maxResponses: 1, closesAt: new Date(Date.now() + HOUR_MS).toISOString() });
    await submit();

    const copy = await duplicateForm(FORM, OWNER);
    const stored = await prisma.form.findUniqueOrThrow({ where: { id: copy.id } });

    expect(stored).toMatchObject({ responseCount: 0, maxResponses: null, closesAt: null });
  });
});

describe("claimResponseSlot (the atomic check itself)", () => {
  const claimAt = (now: Date) => prisma.$transaction((tx) => claimResponseSlot(tx, FORM, now));

  it("increments the counter by one per claim", async () => {
    await claimAt(new Date());
    await claimAt(new Date());

    expect((await counts()).responseCount).toBe(2);
  });

  it("decides by the date inside the claim itself, not only by what the caller read earlier", async () => {
    const closesAt = new Date(Date.now() + HOUR_MS);
    await save({ closesAt: closesAt.toISOString() });

    // The form was open when the caller looked; by the time of the claim the moment has passed.
    await expect(claimAt(new Date(closesAt.getTime() + 1000))).rejects.toMatchObject({
      statusCode: 410,
      message: ErrorCode.FORM_CLOSED_BY_DATE,
    });
    expect((await counts()).responseCount).toBe(0);

    await expect(claimAt(new Date(closesAt.getTime() - 1000))).resolves.toBeUndefined();
    expect((await counts()).responseCount).toBe(1);
  });

  it("decides by the limit inside the claim itself", async () => {
    await save({ maxResponses: 1 });

    await claimAt(new Date());

    await expect(claimAt(new Date())).rejects.toMatchObject({
      message: ErrorCode.FORM_CLOSED_BY_LIMIT,
    });
    expect((await counts()).responseCount).toBe(1);
  });

  it("is a no-op for the counter when the surrounding transaction fails", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await claimResponseSlot(tx, FORM);
        throw new Error("something later failed");
      }),
    ).rejects.toThrow("something later failed");

    expect((await counts()).responseCount).toBe(0);
  });
});

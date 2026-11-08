import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ErrorCode, FILE_LIMITS } from "@quorvia/shared-types";

// FILE questions end to end on a REAL Prisma + Postgres (PGlite) and real files in a temp directory:
// anonymous upload and its limits, attaching to a response, the owner's download, analytics and
// the cleanup.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "files-int-"));

vi.mock("./file.storage.js", async () => {
  const { DiskStorage } = await import("../asset/asset.storage.js");

  return { defaultFileStorage: new DiskStorage(storageDir), FILES_DIR: storageDir };
});

const { prisma } = await import("../../prisma/prisma.js");
const { defaultFileStorage: storage } = await import("./file.storage.js");
const { uploadResponseFile, deleteUnattachedFile, getOwnerFile } = await import("./file.service.js");
const { updateForm, deleteForm } = await import("../form/form.service.js");
const { submitResponse } = await import("../response/response.service.js");
const { getFormAnalytics, getQuestionAnalytics, getResponseById } = await import(
  "../analytics/analytics.service.js"
);
const { cleanupOrphanResponseFiles } = await import("../maintenance/maintenance.service.js");
const { makePng } = await import("../asset/testImages.js");

const OWNER = "user-1";
const OTHER = "user-2";
const FORM = "form-1";
const SHARE = "share-1";
const Q = "q-file";
const Q2 = "q-file-2";
const SESSION = "11111111-1111-4111-8111-111111111111";
const OTHER_SESSION = "22222222-2222-4222-8222-222222222222";
const DAY_MS = 24 * 60 * 60 * 1000;

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");

const keysOf = async () => {
  const keys: string[] = [];
  for await (const object of storage.list()) keys.push(object.key);
  return keys.sort();
};

const rejectsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ message: code });

const fileQuestion = (id = Q, extra: Record<string, unknown> = {}) => ({
  id,
  text: "Attach a file",
  type: "FILE" as const,
  order: 0,
  required: false,
  config: { maxFiles: 2 },
  ...extra,
});

const save = (questions: unknown[]) => updateForm(FORM, OWNER, { title: "Form", questions } as never);

const upload = (overrides: Record<string, unknown> = {}) =>
  uploadResponseFile({
    shareId: SHARE,
    sessionKey: SESSION,
    questionId: Q,
    rawName: "report.pdf",
    data: PDF,
    ...overrides,
  } as never);

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
    data: { id: FORM, title: "Form", userId: OWNER, shareId: SHARE, isPublished: true },
  });
  await save([fileQuestion()]);
});

afterEach(async () => {
  for (const key of await keysOf()) await storage.remove(key);
});

afterAll(async () => {
  await prisma.$disconnect();
  await fs.rm(storageDir, { recursive: true, force: true });
});

describe("uploadResponseFile", () => {
  it("stores the file under a random name and returns only safe metadata", async () => {
    const dto = await upload({ rawName: "../../Звіт.pdf" });

    expect(Object.keys(dto).sort()).toEqual(["id", "mime", "name", "size"]);
    expect(dto).toMatchObject({ name: "Звіт.pdf", size: PDF.length, mime: "application/pdf" });

    const row = await prisma.responseFile.findUniqueOrThrow({ where: { id: dto.id } });

    expect(row).toMatchObject({ formId: FORM, questionId: Q, sessionKey: SESSION, responseId: null });
    expect(row.storageKey).toMatch(/^[0-9a-f-]{36}\.bin$/);
    expect(row.storageKey).not.toContain("pdf");
    expect((await storage.get(row.storageKey))!.equals(PDF)).toBe(true);
  });

  it("detects the type from the bytes, not from the name", async () => {
    const dto = await upload({ rawName: "photo.exe", data: await makePng() });

    expect(dto).toMatchObject({ mime: "image/png", name: "photo.png" });
  });

  it("404 for an unknown form and 400 for an unpublished one", async () => {
    await rejectsWith(upload({ shareId: "nope" }), ErrorCode.FORM_NOT_FOUND);

    await prisma.form.update({ where: { id: FORM }, data: { isPublished: false } });
    await rejectsWith(upload(), ErrorCode.FORM_NOT_PUBLISHED);
  });

  it("refuses an unknown question and a question of another type alike", async () => {
    await save([
      fileQuestion(),
      { id: "q-text", text: "T", type: "TEXT", order: 1, required: false, config: { variant: "input" } },
    ]);

    await rejectsWith(upload({ questionId: "missing" }), ErrorCode.FILE_UPLOAD_INVALID);
    await rejectsWith(upload({ questionId: "q-text" }), ErrorCode.FILE_UPLOAD_INVALID);
    expect(await prisma.responseFile.count()).toBe(0);
  });

  it("stops at maxFiles per question and session, but not for another session", async () => {
    await upload();
    await upload();

    await rejectsWith(upload(), ErrorCode.FILE_LIMIT_REACHED);
    await expect(upload({ sessionKey: OTHER_SESSION })).resolves.toBeDefined();
  });

  it("defaults to one file when the question has no config", async () => {
    await save([fileQuestion(Q, { config: null })]);

    await upload();

    await rejectsWith(upload(), ErrorCode.FILE_LIMIT_REACHED);
  });

  it("limits the pending files of one session across questions", async () => {
    const questions = Array.from({ length: 6 }, (_, i) => fileQuestion(`q-${i}`, { order: i, config: { maxFiles: 3 } }));
    await save(questions);

    for (let i = 0; i < FILE_LIMITS.maxFilesPerSession; i++) {
      await upload({ questionId: `q-${i % 6}`, sessionKey: SESSION }).catch(() => undefined);
    }

    expect(await prisma.responseFile.count({ where: { sessionKey: SESSION } })).toBe(
      FILE_LIMITS.maxFilesPerSession,
    );
    await rejectsWith(upload({ questionId: "q-5" }), ErrorCode.FILE_LIMIT_REACHED);
  });

  it("stops at the storage quota of the form", async () => {
    await prisma.responseFile.create({
      data: {
        formId: FORM,
        questionId: Q,
        sessionKey: OTHER_SESSION,
        originalName: "big.pdf",
        mime: "application/pdf",
        size: FILE_LIMITS.maxBytesPerForm - 10,
        storageKey: "33333333-3333-4333-8333-333333333333.bin",
      },
    });

    await rejectsWith(upload(), ErrorCode.FILE_QUOTA_EXCEEDED);
    expect(await keysOf()).toEqual([]);
  });

  it("leaves neither a row nor a file after rejected content", async () => {
    await rejectsWith(upload({ data: Buffer.from("MZ\0\0binary") }), ErrorCode.FILE_INVALID_TYPE);

    expect(await prisma.responseFile.count()).toBe(0);
    expect(await keysOf()).toEqual([]);
  });

  it("removes the file again when the row cannot be written", async () => {
    const spy = vi.spyOn(prisma.responseFile, "create").mockRejectedValueOnce(new Error("db down"));

    await expect(upload()).rejects.toThrow("db down");

    spy.mockRestore();
    expect(await keysOf()).toEqual([]);
  });
});

describe("deleteUnattachedFile", () => {
  it("lets the same session remove its pending file, row and bytes", async () => {
    const dto = await upload();

    await deleteUnattachedFile(SHARE, SESSION, dto.id);

    expect(await prisma.responseFile.count()).toBe(0);
    expect(await keysOf()).toEqual([]);
  });

  it("404 for another session, another form and an unknown id", async () => {
    const dto = await upload();

    await rejectsWith(deleteUnattachedFile(SHARE, OTHER_SESSION, dto.id), ErrorCode.FILE_NOT_FOUND);
    await rejectsWith(deleteUnattachedFile("other-share", SESSION, dto.id), ErrorCode.FILE_NOT_FOUND);
    await rejectsWith(deleteUnattachedFile(SHARE, SESSION, "nope"), ErrorCode.FILE_NOT_FOUND);
    expect(await prisma.responseFile.count()).toBe(1);
  });

  it("cannot remove a file that is already part of a response", async () => {
    const dto = await upload();
    await submitResponse(SHARE, { [Q]: [dto.id] }, SESSION);

    await rejectsWith(deleteUnattachedFile(SHARE, SESSION, dto.id), ErrorCode.FILE_NOT_FOUND);
    expect(await prisma.responseFile.count()).toBe(1);
  });
});

describe("submitResponse with files", () => {
  const submitFails = async (promise: Promise<unknown>) => {
    await expect(promise).rejects.toMatchObject({
      message: ErrorCode.RESPONSE_VALIDATION_FAILED,
      errors: expect.arrayContaining([expect.objectContaining({ message: ErrorCode.VALIDATION_FILES_INVALID })]),
    });
    expect(await prisma.response.count()).toBe(0);
  };

  it("attaches the files to the new response", async () => {
    const a = await upload();
    const b = await upload({ rawName: "b.pdf" });

    const response = await submitResponse(SHARE, { [Q]: [a.id, b.id] }, SESSION);
    const files = await prisma.responseFile.findMany({ where: { responseId: response.id } });

    expect(files.map((f) => f.id).sort()).toEqual([a.id, b.id].sort());
    expect((response.answers as Record<string, unknown>)[Q]).toEqual([a.id, b.id]);
  });

  it("works for an optional question left empty", async () => {
    await expect(submitResponse(SHARE, {}, SESSION)).resolves.toBeDefined();
  });

  it("rejects a file of another session and creates no response", async () => {
    const foreign = await upload({ sessionKey: OTHER_SESSION });

    await submitFails(submitResponse(SHARE, { [Q]: [foreign.id] }, SESSION));
    expect((await prisma.responseFile.findUniqueOrThrow({ where: { id: foreign.id } })).responseId).toBeNull();
  });

  it("rejects an unknown file id", async () => {
    await submitFails(submitResponse(SHARE, { [Q]: ["11111111-aaaa-4bbb-8ccc-111111111111"] }, SESSION));
  });

  it("rejects files without a session key", async () => {
    const dto = await upload();

    await submitFails(submitResponse(SHARE, { [Q]: [dto.id] }));
  });

  it("rejects a file uploaded for another question", async () => {
    await save([fileQuestion(Q), fileQuestion(Q2, { order: 1 })]);
    const forFirst = await upload({ questionId: Q });

    await submitFails(submitResponse(SHARE, { [Q2]: [forFirst.id] }, SESSION));
  });

  it("rejects the same file twice in one answer", async () => {
    const dto = await upload();

    await submitFails(submitResponse(SHARE, { [Q]: [dto.id, dto.id] }, SESSION));
  });

  it("rejects a file that a response already took, without creating another response", async () => {
    const dto = await upload();
    await submitResponse(SHARE, { [Q]: [dto.id] }, SESSION);

    await expect(submitResponse(SHARE, { [Q]: [dto.id] }, SESSION)).rejects.toMatchObject({
      message: ErrorCode.RESPONSE_VALIDATION_FAILED,
    });
    expect(await prisma.response.count()).toBe(1);
  });

  it("rolls the response back when a later file is invalid", async () => {
    const good = await upload();
    const foreign = await upload({ sessionKey: OTHER_SESSION });

    await submitFails(submitResponse(SHARE, { [Q]: [good.id, foreign.id] }, SESSION));

    // Nothing was attached: the good file is still free.
    expect((await prisma.responseFile.findUniqueOrThrow({ where: { id: good.id } })).responseId).toBeNull();
  });

  it("rejects more files than the question allows", async () => {
    await expect(
      submitResponse(SHARE, { [Q]: ["a", "b", "c"] }, SESSION),
    ).rejects.toMatchObject({ message: ErrorCode.RESPONSE_VALIDATION_FAILED });
  });

  it("requires a file for a required question", async () => {
    await save([fileQuestion(Q, { required: true })]);

    await expect(submitResponse(SHARE, {}, SESSION)).rejects.toMatchObject({
      message: ErrorCode.RESPONSE_VALIDATION_FAILED,
    });
    await expect(submitResponse(SHARE, { [Q]: [] }, SESSION)).rejects.toMatchObject({
      message: ErrorCode.RESPONSE_VALIDATION_FAILED,
    });
  });

  it("ignores the files of a question hidden by a condition", async () => {
    await save([
      { id: "q-gate", text: "Gate", type: "BOOLEAN", order: 0, required: false, config: { defaultValue: false } },
      fileQuestion(Q, {
        order: 1,
        condition: { operator: "AND", rules: [{ questionId: "q-gate", operator: "equals", value: true }] },
      }),
    ]);
    const dto = await upload();

    const response = await submitResponse(SHARE, { "q-gate": false, [Q]: [dto.id] }, SESSION);

    expect((response.answers as Record<string, unknown>)[Q]).toBeUndefined();
    expect((await prisma.responseFile.findUniqueOrThrow({ where: { id: dto.id } })).responseId).toBeNull();
  });
});

describe("the owner's view", () => {
  const submitted = async (name = "Звіт.pdf") => {
    const dto = await upload({ rawName: name });
    const response = await submitResponse(SHARE, { [Q]: [dto.id] }, SESSION);

    return { dto, response };
  };

  it("downloads an attached file", async () => {
    const { dto, response } = await submitted();

    const file = await getOwnerFile(FORM, response.id, dto.id, OWNER);

    expect(file).toMatchObject({ name: "Звіт.pdf", mime: "application/pdf" });
    expect(file.data.equals(PDF)).toBe(true);
  });

  it("403 for another user, 404 for a wrong response, an unattached file or a missing file", async () => {
    const { dto, response } = await submitted();
    const pending = await upload({ sessionKey: OTHER_SESSION });

    await rejectsWith(getOwnerFile(FORM, response.id, dto.id, OTHER), ErrorCode.FORM_FORBIDDEN);
    await rejectsWith(getOwnerFile(FORM, "other-response", dto.id, OWNER), ErrorCode.FILE_NOT_FOUND);
    await rejectsWith(getOwnerFile(FORM, response.id, pending.id, OWNER), ErrorCode.FILE_NOT_FOUND);

    const row = await prisma.responseFile.findUniqueOrThrow({ where: { id: dto.id } });
    await storage.remove(row.storageKey);

    await rejectsWith(getOwnerFile(FORM, response.id, dto.id, OWNER), ErrorCode.FILE_NOT_FOUND);
  });

  it("shows file names and the list of files in the response details", async () => {
    const { dto, response } = await submitted();

    const details = await getResponseById(FORM, response.id, OWNER);
    const answer = details.answers.find((a) => a.questionId === Q)!;

    expect(answer.displayValue).toEqual(["Звіт.pdf"]);
    expect(answer.files).toEqual([{ id: dto.id, name: "Звіт.pdf", size: PDF.length, mime: "application/pdf" }]);
  });

  it("counts the uploaded files in the analytics overview and has no detail view", async () => {
    const a = await upload();
    const b = await upload();
    await submitResponse(SHARE, { [Q]: [a.id, b.id] }, SESSION);
    await submitResponse(SHARE, {}, OTHER_SESSION);

    const overview = await getFormAnalytics(FORM, OWNER);
    const question = overview.questions.find((item) => item.id === Q)!;

    expect(question).toMatchObject({ type: "FILE", fileCount: 2, shownCount: 2, skippedCount: 1 });
    await expect(getQuestionAnalytics(FORM, Q, OWNER)).rejects.toMatchObject({
      message: ErrorCode.ANALYTICS_UNSUPPORTED_TYPE,
    });
  });
});

describe("deleteForm", () => {
  it("removes the respondents' files with the form", async () => {
    const dto = await upload();
    await submitResponse(SHARE, { [Q]: [dto.id] }, SESSION);
    await upload({ sessionKey: OTHER_SESSION });

    await deleteForm(FORM, OWNER);

    expect(await prisma.responseFile.count()).toBe(0);
    expect(await keysOf()).toEqual([]);
  });
});

describe("cleanupOrphanResponseFiles", () => {
  const NOW = new Date();
  const age = (ms: number) => new Date(NOW.getTime() - ms);

  const aged = async (ms: number, overrides: Record<string, unknown> = {}) => {
    const dto = await upload(overrides);
    await prisma.responseFile.update({ where: { id: dto.id }, data: { createdAt: age(ms) } });
    return dto;
  };

  it("removes old unattached files and keeps fresh and attached ones", async () => {
    const oldUnattached = await aged(3 * DAY_MS);
    const fresh = await aged(60 * 1000, { sessionKey: OTHER_SESSION });
    const attached = await aged(3 * DAY_MS, { sessionKey: "44444444-4444-4444-8444-444444444444" });
    await submitResponse(SHARE, { [Q]: [attached.id] }, "44444444-4444-4444-8444-444444444444");

    const result = await cleanupOrphanResponseFiles({ now: NOW });

    expect(result.rows).toBe(1);
    const left = (await prisma.responseFile.findMany({ select: { id: true } })).map((f) => f.id).sort();
    expect(left).toEqual([attached.id, fresh.id].sort());
    expect(await keysOf()).toHaveLength(2);
    expect(left).not.toContain(oldUnattached.id);
  });

  it("removes old files without a row but not fresh ones", async () => {
    const oldKey = "55555555-5555-4555-8555-555555555555.bin";
    const freshKey = "66666666-6666-4666-8666-666666666666.bin";
    await storage.put(oldKey, Buffer.from("x"));
    await storage.put(freshKey, Buffer.from("x"));
    await fs.utimes(path.join(storageDir, oldKey), age(3 * DAY_MS), age(3 * DAY_MS));

    const result = await cleanupOrphanResponseFiles({ now: NOW });

    expect(result.files).toBe(1);
    expect(await keysOf()).toEqual([freshKey]);
  });

  it("keeps the files of a file that was attached while the cleanup was running", async () => {
    const dto = await aged(3 * DAY_MS);
    const real = prisma.responseFile.findMany.bind(prisma.responseFile);
    const spy = vi.spyOn(prisma.responseFile, "findMany").mockImplementationOnce((async (args?: never) => {
      const batch = await real(args);
      // The submit wins the race right after the batch was read.
      await submitResponse(SHARE, { [Q]: [dto.id] }, SESSION);
      return batch;
    }) as never);

    await cleanupOrphanResponseFiles({ now: NOW });

    spy.mockRestore();
    const row = await prisma.responseFile.findUnique({ where: { id: dto.id } });
    expect(row?.responseId).not.toBeNull();
  });

  it("works in batches", async () => {
    for (let i = 0; i < 3; i++) await aged(3 * DAY_MS, { sessionKey: `00000000-0000-4000-8000-00000000000${i}` });

    const result = await cleanupOrphanResponseFiles({ now: NOW, batchSize: 2 });

    expect(result.rows).toBe(3);
    expect(await keysOf()).toEqual([]);
  });
});

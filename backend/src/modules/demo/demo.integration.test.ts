import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_LIMITS, ErrorCode } from "@quorvia/shared-types";

// The demo account on a REAL Prisma + Postgres (PGlite): the cleanup has to respect foreign keys
// that have no ON DELETE CASCADE (Form -> User, ExportJob -> User), and a mock cannot show that.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { startDemoSession, cleanupExpiredDemoUsers, assertResponseCapacity } =
  await import("./demo.service.js");
const { createForm, duplicateForm, updateForm } = await import("../form/form.service.js");
const { refreshAccessToken } = await import("../auth/auth.service.js");

const HOUR = 60 * 60 * 1000;

const question = (id: string, order: number, type = "TEXT") => ({
  id,
  text: `Питання ${order + 1}`,
  type,
  order,
  required: false,
});

const questions = (count: number) =>
  Array.from({ length: count }, (_, index) => question(`q${index}`, index));

const makeUser = (id: string, extra: Record<string, unknown> = {}) =>
  prisma.user.create({ data: { id, email: `${id}@test.invalid`, password: "x", ...extra } });

const makeDemoUser = (id: string, expiresInMs: number) =>
  makeUser(id, { isDemo: true, demoExpiresAt: new Date(Date.now() + expiresInMs) });

const makeForm = (id: string, userId: string) =>
  prisma.form.create({
    data: {
      id,
      title: id,
      userId,
      shareId: `share-${id}`,
      questions: { create: [{ id: `${id}-q`, text: "Q", type: "TEXT", order: 0 }] },
    },
  });

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-vitest";
});

beforeEach(async () => {
  process.env.IS_FOR_PORTFOLIO = "true";
  await prisma.exportJob.deleteMany();
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
});

afterEach(() => {
  delete process.env.IS_FOR_PORTFOLIO;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("startDemoSession", () => {
  it("створює демо-акаунт на DEMO_LIMITS.ttlHours і видає сесію, що не переживає акаунт", async () => {
    const before = Date.now();
    const session = await startDemoSession();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
    expect(user.isDemo).toBe(true);
    expect(user.email).toMatch(/^demo-[0-9a-f]{16}@demo\.quorvia\.invalid$/);
    expect(user.demoExpiresAt!.getTime()).toBeGreaterThanOrEqual(
      before + DEMO_LIMITS.ttlHours * HOUR - 1000,
    );
    expect(user.demoExpiresAt!.getTime()).toBeLessThanOrEqual(
      Date.now() + DEMO_LIMITS.ttlHours * HOUR,
    );

    // Refresh cookie expires with the account (it would live 30 days otherwise).
    expect(session.refreshTokenExpiresAt.getTime()).toBe(user.demoExpiresAt!.getTime());
    expect(session.user).toEqual({
      id: user.id,
      email: user.email,
      demo: { expiresAt: user.demoExpiresAt!.toISOString() },
    });
    expect(session.accessToken).toBeTruthy();
  });

  it("сесію демо-акаунта можна оновити, доки він живий, і не можна після терміну", async () => {
    const session = await startDemoSession();

    const refreshed = await refreshAccessToken(session.refreshToken);
    expect(refreshed.user.demo?.expiresAt).toBe(session.user.demo?.expiresAt);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { demoExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(refreshAccessToken(refreshed.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      message: ErrorCode.AUTH_DEMO_EXPIRED,
    });
  });

  it("не працює поза портфоліо-режимом: 404 DEMO_UNAVAILABLE і жодного акаунта", async () => {
    delete process.env.IS_FOR_PORTFOLIO;

    await expect(startDemoSession()).rejects.toMatchObject({
      statusCode: 404,
      message: ErrorCode.DEMO_UNAVAILABLE,
    });
    expect(await prisma.user.count()).toBe(0);
  });

  it("відмовляє, коли живих демо-акаунтів уже maxActiveAccounts (протерміновані не рахуються)", async () => {
    await prisma.user.createMany({
      data: Array.from({ length: DEMO_LIMITS.maxActiveAccounts }, (_, index) => ({
        id: `live-${index}`,
        email: `live-${index}@test.invalid`,
        password: "x",
        isDemo: true,
        demoExpiresAt: new Date(Date.now() + HOUR),
      })),
    });

    await expect(startDemoSession()).rejects.toMatchObject({
      statusCode: 503,
      message: ErrorCode.DEMO_CAPACITY_REACHED,
    });

    // One of them expires: its place is free again (and the cleanup inside the call removes it).
    await prisma.user.update({
      where: { id: "live-0" },
      data: { demoExpiresAt: new Date(Date.now() - HOUR) },
    });

    await expect(startDemoSession()).resolves.toBeDefined();
  });
});

describe("cleanupExpiredDemoUsers", () => {
  it("видаляє протермінований демо-акаунт з усім, що йому належить, і не чіпає решту", async () => {
    await makeDemoUser("expired", -HOUR);
    await makeDemoUser("alive", HOUR);
    await makeUser("regular");

    for (const owner of ["expired", "alive", "regular"]) {
      await makeForm(`form-${owner}`, owner);
      await prisma.response.create({ data: { formId: `form-${owner}`, answers: {} } });
      await prisma.responseAttempt.create({
        data: { formId: `form-${owner}`, sessionKey: "s", answers: {} },
      });
      await prisma.exportJob.create({
        data: { formId: `form-${owner}`, userId: owner, format: "CSV" },
      });
      await prisma.refreshToken.create({
        data: { tokenHash: `hash-${owner}`, userId: owner, expiresAt: new Date(Date.now() + HOUR) },
      });
    }

    const result = await cleanupExpiredDemoUsers();

    expect(result).toEqual({ users: 1 });
    expect(await prisma.user.findMany({ select: { id: true }, orderBy: { id: "asc" } })).toEqual([
      { id: "alive" },
      { id: "regular" },
    ]);
    // Everything under the expired account is gone, everything under the others is intact.
    for (const [model, expected] of [
      [prisma.form, 2],
      [prisma.question, 2],
      [prisma.response, 2],
      [prisma.responseAttempt, 2],
      [prisma.exportJob, 2],
      [prisma.refreshToken, 2],
    ] as const) {
      expect(await (model as { count: () => Promise<number> }).count()).toBe(expected);
    }
  });

  it("звичайний акаунт без терміну ніколи не вважається протермінованим", async () => {
    await makeUser("regular");

    expect(await cleanupExpiredDemoUsers()).toEqual({ users: 0 });
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("ліміти демо-акаунта", () => {
  it("не дає створити більше DEMO_LIMITS.maxForms форм (створення і дублювання)", async () => {
    await makeDemoUser("demo", HOUR);
    for (let i = 0; i < DEMO_LIMITS.maxForms; i++) await makeForm(`f${i}`, "demo");

    await expect(createForm({ title: "Ще одна", userId: "demo" })).rejects.toMatchObject({
      statusCode: 403,
      message: ErrorCode.DEMO_FORM_LIMIT_REACHED,
    });
    await expect(duplicateForm("f0", "demo")).rejects.toMatchObject({
      message: ErrorCode.DEMO_FORM_LIMIT_REACHED,
    });
    expect(await prisma.form.count()).toBe(DEMO_LIMITS.maxForms);

    // A deleted form frees a place.
    await prisma.form.delete({ where: { id: "f0" } });
    await expect(createForm({ title: "Нова", userId: "demo" })).resolves.toMatchObject({
      title: "Нова",
    });
  });

  it("форма демо-акаунта має до maxQuestionsPerForm питань", async () => {
    await makeDemoUser("demo", HOUR);
    await makeForm("f", "demo");
    const save = (count: number) =>
      updateForm("f", "demo", { title: "f", questions: questions(count) } as never);

    await expect(save(DEMO_LIMITS.maxQuestionsPerForm + 1)).rejects.toMatchObject({
      statusCode: 403,
      message: ErrorCode.DEMO_QUESTION_LIMIT_REACHED,
    });
    await expect(save(DEMO_LIMITS.maxQuestionsPerForm)).resolves.toMatchObject({ success: true });
    expect(await prisma.question.count({ where: { formId: "f" } })).toBe(
      DEMO_LIMITS.maxQuestionsPerForm,
    );
  });

  it("звичайного користувача (не демо) ліміти не стосуються, навіть у портфоліо-режимі", async () => {
    await makeUser("regular");
    for (let i = 0; i < DEMO_LIMITS.maxForms + 1; i++) await makeForm(`f${i}`, "regular");

    await expect(createForm({ title: "Ще", userId: "regular" })).resolves.toBeDefined();
    await expect(
      updateForm("f0", "regular", {
        title: "f0",
        questions: questions(DEMO_LIMITS.maxQuestionsPerForm + 5),
      } as never),
    ).resolves.toMatchObject({ success: true });
  });

  it("без IS_FOR_PORTFOLIO демо-акаунт теж не обмежується (ліміти існують лише в портфоліо)", async () => {
    delete process.env.IS_FOR_PORTFOLIO;
    await makeDemoUser("demo", HOUR);
    for (let i = 0; i < DEMO_LIMITS.maxForms; i++) await makeForm(`f${i}`, "demo");

    await expect(createForm({ title: "Ще", userId: "demo" })).resolves.toBeDefined();
  });

  it("питання, що потребують сховища файлів (IMAGE_CHOICE, FILE), недоступні у портфоліо-режимі", async () => {
    await makeUser("regular");
    await makeForm("f", "regular");

    for (const type of ["IMAGE_CHOICE", "FILE"]) {
      await expect(
        updateForm("f", "regular", { title: "f", questions: [question("x", 0, type)] } as never),
      ).rejects.toMatchObject({ statusCode: 403, message: ErrorCode.FEATURE_DISABLED });
    }
  });
});

describe("ліміт відповідей на демо-форму", () => {
  const fill = (formId: string, count: number) =>
    prisma.response.createMany({
      data: Array.from({ length: count }, () => ({ formId, answers: {} })),
    });

  it("публічна форма демо-акаунта приймає до maxResponsesPerForm відповідей", async () => {
    await makeDemoUser("demo", HOUR);
    await makeForm("f", "demo");

    await fill("f", DEMO_LIMITS.maxResponsesPerForm - 1);
    await expect(assertResponseCapacity("f", "demo")).resolves.toBeUndefined();

    await fill("f", 1);
    await expect(assertResponseCapacity("f", "demo")).rejects.toMatchObject({
      statusCode: 403,
      message: ErrorCode.DEMO_RESPONSE_LIMIT_REACHED,
    });
  });

  it("форми звичайних акаунтів не обмежені, як і поза портфоліо-режимом", async () => {
    await makeUser("regular");
    await makeDemoUser("demo", HOUR);
    await makeForm("fr", "regular");
    await makeForm("fd", "demo");
    await fill("fr", DEMO_LIMITS.maxResponsesPerForm + 1);
    await fill("fd", DEMO_LIMITS.maxResponsesPerForm + 1);

    await expect(assertResponseCapacity("fr", "regular")).resolves.toBeUndefined();

    delete process.env.IS_FOR_PORTFOLIO;
    await expect(assertResponseCapacity("fd", "demo")).resolves.toBeUndefined();
  });
});

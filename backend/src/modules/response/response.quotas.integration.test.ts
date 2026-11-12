import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";

// Quotas at submit, on a REAL Prisma + Postgres (PGlite): the places are taken atomically in the
// same transaction as the response, a full quota turns the respondent away without leaving a trace,
// and the respondent is warned early while filling the form.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { errorHandler } = await import("../../shared/middleware/errorHandler.js");
const { submitResponse } = await import("./response.service.js");
const responseRoutes = (await import("./response.routes.js")).default;
const attemptRoutes = (await import("../attempt/attempt.routes.js")).default;

const app = express();

app.use(express.json());
app.use("/api/forms", responseRoutes);
app.use("/api/forms", attemptRoutes);
app.use(errorHandler);

const USER = "user-1";
const FORM = "form-1";
const SHARE = "share-1";

const city = {
  id: "q-city",
  text: "City",
  type: "CHOICE_SINGLE" as const,
  order: 0,
  required: true,
  options: [
    { id: "kyiv", text: "Kyiv" },
    { id: "lviv", text: "Lviv" },
  ],
};
// Only shown to people from Lviv.
const district = {
  id: "q-district",
  text: "District",
  type: "TEXT" as const,
  order: 1,
  required: false,
  condition: {
    logic: "AND",
    rules: [{ questionId: "q-city", operator: "equals", value: "lviv" }],
  },
};

const when = (questionId: string, value: unknown) => ({
  logic: "AND",
  rules: [{ questionId, operator: "equals", value }],
});

const quota = (id: string, condition: unknown, data: Record<string, unknown> = {}) =>
  prisma.formQuota.create({
    data: {
      id,
      formId: FORM,
      name: `internal ${id}`,
      condition: condition as never,
      limit: 2,
      ...data,
    },
  });

const submit = (answers: Record<string, unknown>, sessionKey?: string) =>
  submitResponse(SHARE, answers as never, sessionKey);

const quotaState = async () =>
  Object.fromEntries((await prisma.formQuota.findMany()).map((q) => [q.id, q.count]));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
});

beforeEach(async () => {
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: USER, email: "a@b.c", password: "x" } });
  await prisma.form.create({
    data: {
      id: FORM,
      title: "Form",
      userId: USER,
      shareId: SHARE,
      isPublished: true,
      questions: { create: [city, district] as never },
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("counting a response in the quotas it falls into", () => {
  it("counts a matching response and remembers which quotas it was counted in", async () => {
    await quota("kyiv", when("q-city", "kyiv"));
    await quota("lviv", when("q-city", "lviv"));

    await submit({ "q-city": "kyiv" });

    expect(await quotaState()).toEqual({ kyiv: 1, lviv: 0 });
    expect((await prisma.response.findFirstOrThrow()).quotaIds).toEqual(["kyiv"]);
  });

  it("counts a response in every quota it matches", async () => {
    await quota("a", when("q-city", "kyiv"));
    await quota("b", {
      logic: "OR",
      rules: [{ questionId: "q-city", operator: "in", value: ["kyiv", "lviv"] }],
    });

    await submit({ "q-city": "kyiv" });

    expect(await quotaState()).toEqual({ a: 1, b: 1 });
    expect((await prisma.response.findFirstOrThrow()).quotaIds).toEqual(["a", "b"]);
  });

  it("stores no quota ids for a response that matched none", async () => {
    await quota("lviv", when("q-city", "lviv"));

    await submit({ "q-city": "kyiv" });

    expect(await quotaState()).toEqual({ lviv: 0 });
    expect((await prisma.response.findFirstOrThrow()).quotaIds).toBeNull();
  });

  it("does not count an answer that a condition hid", async () => {
    await quota("district", when("q-district", "centre"));

    // The district is hidden for Kyiv, so the answer sent for it is not a real one.
    await submit({ "q-city": "kyiv", "q-district": "centre" });
    await submit({ "q-city": "lviv", "q-district": "centre" });

    expect(await quotaState()).toEqual({ district: 1 });
  });

  it("works without any quota", async () => {
    await submit({ "q-city": "kyiv" });

    expect(await prisma.response.count()).toBe(1);
  });
});

describe("a full quota", () => {
  it("turns the respondent away with the owner's message, and leaves no trace", async () => {
    await quota("kyiv", when("q-city", "kyiv"), { count: 2, message: "No more places for Kyiv" });

    await expect(submit({ "q-city": "kyiv" })).rejects.toMatchObject({
      message: "QUOTA_FULL",
      statusCode: 409,
      errors: { message: "No more places for Kyiv" },
    });

    expect(await prisma.response.count()).toBe(0);
    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).responseCount).toBe(0);
    expect(await quotaState()).toEqual({ kyiv: 2 });
  });

  it("still takes people from other groups", async () => {
    await quota("kyiv", when("q-city", "kyiv"), { count: 2 });
    await quota("lviv", when("q-city", "lviv"));

    await submit({ "q-city": "lviv" });

    expect(await quotaState()).toEqual({ kyiv: 2, lviv: 1 });
  });

  it("rolls back the places already taken when a later quota is full", async () => {
    // Quotas are taken in id order: "a" is open and is taken first, "b" is full and refuses.
    await quota("a", when("q-city", "kyiv"));
    await quota("b", when("q-city", "kyiv"), { count: 2 });

    await expect(submit({ "q-city": "kyiv" })).rejects.toMatchObject({ message: "QUOTA_FULL" });

    expect(await quotaState()).toEqual({ a: 0, b: 2 });
    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).responseCount).toBe(0);
    expect(await prisma.response.count()).toBe(0);
  });

  it("does not use up a place of the form itself", async () => {
    await prisma.form.update({ where: { id: FORM }, data: { maxResponses: 1 } });
    await quota("kyiv", when("q-city", "kyiv"), { count: 2 });

    await expect(submit({ "q-city": "kyiv" })).rejects.toMatchObject({ message: "QUOTA_FULL" });
    await expect(submit({ "q-city": "lviv" })).resolves.toBeTruthy();
  });

  it("counts a quota whose limit was lowered below its count as full", async () => {
    await quota("kyiv", when("q-city", "kyiv"), { count: 9, limit: 3 });

    await expect(submit({ "q-city": "kyiv" })).rejects.toMatchObject({ message: "QUOTA_FULL" });
  });

  it("opens up again when the limit is raised", async () => {
    await quota("kyiv", when("q-city", "kyiv"), { count: 2 });
    await expect(submit({ "q-city": "kyiv" })).rejects.toMatchObject({ message: "QUOTA_FULL" });

    await prisma.formQuota.update({ where: { id: "kyiv" }, data: { limit: 3 } });

    await expect(submit({ "q-city": "kyiv" })).resolves.toBeTruthy();
    expect(await quotaState()).toEqual({ kyiv: 3 });
  });

  it("is checked after the answers are validated (invalid answers are still a 400)", async () => {
    await quota("kyiv", when("q-city", "kyiv"), { count: 2 });

    await expect(submit({})).rejects.toMatchObject({ message: "RESPONSE_VALIDATION_FAILED" });
  });
});

describe("the last place", () => {
  it("goes to exactly as many parallel respondents as there are places", async () => {
    await quota("kyiv", when("q-city", "kyiv"), { limit: 3 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => submit({ "q-city": "kyiv" })),
    );

    const accepted = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    expect(accepted).toHaveLength(3);
    expect(refused).toHaveLength(7);
    expect(refused.every((r) => r.reason.message === "QUOTA_FULL")).toBe(true);
    expect(await quotaState()).toEqual({ kyiv: 3 });
    expect(await prisma.response.count()).toBe(3);
    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).responseCount).toBe(3);
  });

  it("keeps two quotas consistent under parallel submits", async () => {
    await quota("kyiv", when("q-city", "kyiv"), { limit: 4 });
    await quota(
      "any",
      { logic: "OR", rules: [{ questionId: "q-city", operator: "in", value: ["kyiv", "lviv"] }] },
      { limit: 5 },
    );

    await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => submit({ "q-city": i % 2 === 0 ? "kyiv" : "lviv" })),
    );

    const state = await quotaState();
    const responses = await prisma.response.findMany();

    expect(state.any).toBe(5);
    expect(state.kyiv).toBeLessThanOrEqual(4);
    // The counters are exactly the number of responses counted in them.
    expect(responses).toHaveLength(5);
    expect(responses.filter((r) => (r.quotaIds as string[]).includes("kyiv"))).toHaveLength(
      state.kyiv!,
    );
  });
});

describe("over HTTP", () => {
  it("answers 409 QUOTA_FULL with only the respondent's message", async () => {
    await quota("kyiv", when("q-city", "kyiv"), { count: 2, message: "Kyiv is full" });

    const res = await request(app)
      .post(`/api/forms/${SHARE}/responses`)
      .send({ answers: { "q-city": "kyiv" } });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "QUOTA_FULL", errors: { message: "Kyiv is full" } });
    expect(JSON.stringify(res.body)).not.toMatch(/internal kyiv/);
  });

  it("answers 409 with a null message when the owner gave none", async () => {
    await quota("kyiv", when("q-city", "kyiv"), { count: 2 });

    const res = await request(app)
      .post(`/api/forms/${SHARE}/responses`)
      .send({ answers: { "q-city": "kyiv" } });

    expect(res.body).toEqual({ message: "QUOTA_FULL", errors: { message: null } });
  });
});

describe("the early warning while filling the form", () => {
  const autosave = (answers: Record<string, unknown>) =>
    request(app).put(`/api/forms/${SHARE}/attempt`).send({ sessionKey: randomUUID(), answers });

  it("says so when the answers so far fall into a full quota", async () => {
    await quota("kyiv", when("q-city", "kyiv"), { count: 2, message: "Kyiv is full" });

    const res = await autosave({ "q-city": "kyiv" });

    expect(res.status).toBe(200);
    expect(res.body.quotaFull).toEqual({ message: "Kyiv is full" });
    expect(JSON.stringify(res.body)).not.toMatch(/internal kyiv/);
  });

  it("keeps the draft all the same: the respondent did reach these questions", async () => {
    await quota("kyiv", when("q-city", "kyiv"), { count: 2 });

    await autosave({ "q-city": "kyiv" });

    expect(await prisma.responseAttempt.count()).toBe(1);
  });

  it("says nothing for answers that fall into no full quota", async () => {
    await quota("kyiv", when("q-city", "kyiv"), { count: 2 });
    await quota("lviv", when("q-city", "lviv"));

    expect((await autosave({ "q-city": "lviv" })).body.quotaFull).toBeNull();
    expect((await autosave({})).body.quotaFull).toBeNull();
  });

  it("does not count a draft in any quota", async () => {
    await quota("lviv", when("q-city", "lviv"));

    await autosave({ "q-city": "lviv" });

    expect(await quotaState()).toEqual({ lviv: 0 });
  });
});

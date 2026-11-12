import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Quotas over HTTP on a REAL Prisma + Postgres (PGlite): the owner's CRUD, what is refused, the
// recount, and what saving or duplicating the form does to the quotas.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { errorHandler } = await import("../../shared/middleware/errorHandler.js");
const { TEST_JWT_SECRET, makeAuthHeader } = await import("../../test/testApp.js");
const quotaRoutes = (await import("./quota.routes.js")).default;
const formRoutes = (await import("../form/form.routes.js")).default;

const app = express();

app.use(express.json());
app.use("/api/forms", formRoutes);
app.use("/api/forms", quotaRoutes);
app.use(errorHandler);

const USER = "user-1";
const FORM = "form-1";
const AUTH = makeAuthHeader(USER);

const city = {
  id: "q-city",
  text: "City",
  type: "CHOICE_SINGLE",
  order: 0,
  required: false,
  options: [
    { id: "kyiv", text: "Kyiv" },
    { id: "lviv", text: "Lviv" },
  ],
};
const ranking = {
  id: "q-rank",
  text: "Rank",
  type: "RANKING",
  order: 1,
  required: false,
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ],
};

const when = (questionId: string, value: unknown, operator = "equals") => ({
  logic: "AND",
  rules: [{ questionId, operator, value }],
});

const body = (overrides: Record<string, unknown> = {}) => ({
  name: "Kyiv",
  condition: when("q-city", "kyiv"),
  limit: 50,
  ...overrides,
});

const base = `/api/forms/${FORM}/quotas`;
const create = (data: Record<string, unknown> = {}, auth = AUTH) =>
  request(app).post(base).set("Authorization", auth).send(body(data));
const list = () => request(app).get(base).set("Authorization", AUTH);

const saveForm = (questions: unknown[]) =>
  request(app)
    .patch(`/api/forms/${FORM}`)
    .set("Authorization", AUTH)
    .send({ title: "Form", questions });

const addResponse = (answers: Record<string, unknown>, visible?: string[]) =>
  prisma.response.create({
    data: {
      formId: FORM,
      answers: answers as never,
      visibleQuestionIds: visible,
    } as never,
  });

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

beforeEach(async () => {
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: USER, email: "a@b.c", password: "x" } });
  await prisma.user.create({ data: { id: "user-2", email: "b@b.c", password: "x" } });
  await prisma.form.create({
    data: {
      id: FORM,
      title: "Form",
      userId: USER,
      shareId: "share-1",
      questions: { create: [city, ranking].map(({ id, ...q }) => ({ id, ...q }) as never) },
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("creating a quota", () => {
  it("stores it with an empty count and lists it", async () => {
    const res = await create({ message: "  Kyiv is full  " });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Kyiv",
      limit: 50,
      count: 0,
      message: "Kyiv is full",
      condition: when("q-city", "kyiv"),
    });
    expect((await list()).body).toEqual([res.body]);
  });

  it("treats an empty message as none", async () => {
    expect((await create({ message: "   " })).body.message).toBeNull();
  });

  it("starts from the responses that already match, not from zero", async () => {
    await addResponse({ "q-city": "kyiv" });
    await addResponse({ "q-city": "kyiv" });
    await addResponse({ "q-city": "lviv" });

    expect((await create()).body.count).toBe(2);
  });

  it("does not count an answer to a question that was not shown", async () => {
    await addResponse({ "q-city": "kyiv" }, ["q-rank"]);
    await addResponse({ "q-city": "kyiv" }, ["q-city"]);
    // Before the shown questions were recorded: everything counts as shown.
    await addResponse({ "q-city": "kyiv" });

    expect((await create()).body.count).toBe(2);
  });

  it.each([
    ["no name", { name: "  " }],
    ["a zero limit", { limit: 0 }],
    ["a fractional limit", { limit: 1.5 }],
    ["a huge limit", { limit: 1_000_001 }],
    ["a long message", { message: "x".repeat(501) }],
    ["an empty condition", { condition: { logic: "AND", rules: [] } }],
    ["an unknown field", { count: 5 }],
  ])("refuses %s with 400 and stores nothing", async (_label, data) => {
    const res = await create(data);

    expect(res.status).toBe(400);
    expect(await prisma.formQuota.count()).toBe(0);
  });

  it("refuses a condition on a question the form does not have", async () => {
    const res = await create({ condition: when("nope", "x") });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "FORM_INVALID_QUOTAS",
      errors: [{ quotaId: "new", questionId: "nope", reason: "UNKNOWN_QUESTION" }],
    });
  });

  it("refuses a condition on a question type that cannot be compared", async () => {
    const res = await create({ condition: when("q-rank", "a") });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].reason).toBe("UNSUPPORTED_QUESTION_TYPE");
  });

  it("refuses the 21st quota", async () => {
    for (let i = 0; i < 20; i += 1) expect((await create({ name: `Q${i}` })).status).toBe(201);

    const res = await create({ name: "one too many" });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("QUOTA_LIMIT_REACHED");
  });
});

describe("who may touch the quotas", () => {
  it("needs a login", async () => {
    expect((await request(app).get(base)).status).toBe(401);
    expect((await request(app).post(base).send(body())).status).toBe(401);
  });

  it("is the owner's alone", async () => {
    const made = (await create()).body;
    const other = makeAuthHeader("user-2");

    expect((await request(app).get(base).set("Authorization", other)).status).toBe(403);
    expect((await create({}, other)).status).toBe(403);
    expect(
      (
        await request(app)
          .patch(`${base}/${made.id}`)
          .set("Authorization", other)
          .send({ limit: 1 })
      ).status,
    ).toBe(403);
    expect(
      (await request(app).delete(`${base}/${made.id}`).set("Authorization", other)).status,
    ).toBe(403);
    expect(
      (await request(app).post(`${base}/${made.id}/recount`).set("Authorization", other)).status,
    ).toBe(403);
    expect(await prisma.formQuota.count()).toBe(1);
  });

  it("does not reach a quota of another form through this form's address", async () => {
    await prisma.form.create({ data: { id: "form-2", title: "Other", userId: USER } });
    const foreign = await prisma.formQuota.create({
      data: { formId: "form-2", name: "x", condition: when("q", 1) as never, limit: 5 },
    });

    for (const res of [
      await request(app)
        .patch(`${base}/${foreign.id}`)
        .set("Authorization", AUTH)
        .send({ limit: 1 }),
      await request(app).delete(`${base}/${foreign.id}`).set("Authorization", AUTH),
      await request(app).post(`${base}/${foreign.id}/recount`).set("Authorization", AUTH),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("QUOTA_NOT_FOUND");
    }
    expect((await prisma.formQuota.findUniqueOrThrow({ where: { id: foreign.id } })).limit).toBe(5);
  });

  it("answers 404 for a form that does not exist", async () => {
    expect(
      (await request(app).get("/api/forms/nope/quotas").set("Authorization", AUTH)).status,
    ).toBe(404);
  });
});

describe("changing a quota", () => {
  it("renames it and moves the limit without touching the count", async () => {
    await addResponse({ "q-city": "kyiv" });
    const made = (await create()).body;
    const res = await request(app)
      .patch(`${base}/${made.id}`)
      .set("Authorization", AUTH)
      .send({ name: "Capital", limit: 1, message: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Capital", limit: 1, count: 1, message: null });
  });

  it("allows a limit below the count: the quota is simply full", async () => {
    await addResponse({ "q-city": "kyiv" });
    await addResponse({ "q-city": "kyiv" });
    const made = (await create()).body;

    const res = await request(app)
      .patch(`${base}/${made.id}`)
      .set("Authorization", AUTH)
      .send({ limit: 1 });

    expect(res.body).toMatchObject({ limit: 1, count: 2 });
  });

  it("counts again when the condition changes, since the count belonged to the old one", async () => {
    await addResponse({ "q-city": "kyiv" });
    await addResponse({ "q-city": "lviv" });
    await addResponse({ "q-city": "lviv" });
    const made = (await create()).body;

    expect(made.count).toBe(1);

    const res = await request(app)
      .patch(`${base}/${made.id}`)
      .set("Authorization", AUTH)
      .send({ condition: when("q-city", "lviv") });

    expect(res.body).toMatchObject({ count: 2, condition: when("q-city", "lviv") });
  });

  it("refuses an empty change and an invalid condition", async () => {
    const made = (await create()).body;
    const patch = (data: Record<string, unknown>) =>
      request(app).patch(`${base}/${made.id}`).set("Authorization", AUTH).send(data);

    expect((await patch({})).status).toBe(400);
    expect((await patch({ limit: 0 })).status).toBe(400);

    const bad = await patch({ condition: when("nope", 1) });

    expect(bad.status).toBe(400);
    expect(bad.body.errors).toEqual([
      { quotaId: made.id, questionId: "nope", reason: "UNKNOWN_QUESTION" },
    ]);
    expect((await list()).body[0].condition).toEqual(when("q-city", "kyiv"));
  });
});

describe("recounting and deleting", () => {
  it("recounts from the responses, correcting a counter that drifted", async () => {
    await addResponse({ "q-city": "kyiv" });
    const made = (await create()).body;

    await prisma.formQuota.update({ where: { id: made.id }, data: { count: 40 } });
    await addResponse({ "q-city": "kyiv" });

    const res = await request(app).post(`${base}/${made.id}/recount`).set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it("recounts across more responses than one page", async () => {
    await prisma.response.createMany({
      data: Array.from({ length: 2_300 }, (_, i) => ({
        formId: FORM,
        answers: { "q-city": i % 2 === 0 ? "kyiv" : "lviv" },
      })),
    });
    const made = (await create()).body;

    expect(made.count).toBe(1_150);
  }, 30_000);

  it("refuses to recount a quota whose stored condition is damaged", async () => {
    const damaged = await prisma.formQuota.create({
      data: { formId: FORM, name: "x", condition: { nonsense: true }, limit: 5 },
    });

    const res = await request(app).post(`${base}/${damaged.id}/recount`).set("Authorization", AUTH);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("FORM_INVALID_QUOTAS");
  });

  it("deletes a quota; the responses keep what they were counted in", async () => {
    const made = (await create()).body;
    const response = await prisma.response.create({
      data: { formId: FORM, answers: {}, quotaIds: [made.id] },
    });

    expect(
      (await request(app).delete(`${base}/${made.id}`).set("Authorization", AUTH)).body,
    ).toEqual({ success: true });
    expect(await prisma.formQuota.count()).toBe(0);
    expect(
      (await prisma.response.findUniqueOrThrow({ where: { id: response.id } })).quotaIds,
    ).toEqual([made.id]);
  });

  it("is removed together with the form", async () => {
    await create();
    await prisma.form.delete({ where: { id: FORM } });

    expect(await prisma.formQuota.count()).toBe(0);
  });
});

describe("saving the form while quotas exist", () => {
  it("refuses to delete a question that a quota looks at, and changes nothing", async () => {
    await create();

    const res = await saveForm([ranking]);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("FORM_INVALID_QUOTAS");
    expect(res.body.errors[0]).toMatchObject({ questionId: "q-city", reason: "UNKNOWN_QUESTION" });
    expect(await prisma.question.count({ where: { formId: FORM } })).toBe(2);
  });

  it("lets the form change when the quotas' questions stay", async () => {
    await create();

    expect((await saveForm([city])).status).toBe(200);
    expect((await saveForm([{ ...city, text: "Town" }, ranking])).status).toBe(200);
  });

  it("lets the question go once its quota is deleted", async () => {
    const made = (await create()).body;

    await request(app).delete(`${base}/${made.id}`).set("Authorization", AUTH);

    expect((await saveForm([ranking])).status).toBe(200);
  });
});

describe("duplicating a form with quotas", () => {
  it("copies the quotas with an empty count, pointing at the copied questions", async () => {
    await addResponse({ "q-city": "kyiv" });
    await create({ message: "Full" });

    const res = await request(app).post(`/api/forms/${FORM}/duplicate`).set("Authorization", AUTH);

    expect(res.status).toBe(200);

    const stored = await prisma.form.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { questions: true, quotas: true },
    });
    const copiedCity = stored.questions.find((q) => q.text === "City")!;

    expect(copiedCity.id).not.toBe("q-city");
    expect(stored.quotas).toHaveLength(1);
    expect(stored.quotas[0]).toMatchObject({
      name: "Kyiv",
      limit: 50,
      count: 0,
      message: "Full",
      condition: when(copiedCity.id, "kyiv"),
    });
    // The original is untouched.
    expect((await list()).body[0]).toMatchObject({ count: 1, condition: when("q-city", "kyiv") });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Scores in the owner's analytics and in the exports, on a REAL Prisma + Postgres (PGlite): the
// responses are scored by the real submit, then read back the way the owner does.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { errorHandler } = await import("../../shared/middleware/errorHandler.js");
const { TEST_JWT_SECRET, makeAuthHeader } = await import("../../test/testApp.js");
const { submitResponse } = await import("../response/response.service.js");
const { exportToCsv } = await import("../export/exporters/csv.exporter.js");
const analyticsRoutes = (await import("./analytics.routes.js")).default;

const app = express();

app.use(express.json());
app.use("/api/forms", analyticsRoutes);
app.use(errorHandler);

const USER = "user-1";
const FORM = "form-1";
const SHARE = "share-1";
const AUTH = makeAuthHeader(USER);

const level = {
  id: "q-level",
  text: "Level",
  type: "CHOICE_SINGLE" as const,
  order: 0,
  required: false,
  options: [
    { id: "pro", text: "Pro", score: 8 },
    { id: "mid", text: "Mid", score: 4 },
    { id: "new", text: "New", score: 1 },
  ],
};

const scoring = {
  enabled: true,
  categories: [
    { id: "low", label: "Beginner", min: 0, max: 3 },
    { id: "high", label: "Expert", min: 4, max: 10 },
  ],
};

const submit = (answers: Record<string, unknown>) => submitResponse(SHARE, answers as never);

const get = (path: string, auth = AUTH) =>
  request(app).get(`/api/forms/${FORM}${path}`).set("Authorization", auth);

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

const makeForm = async (data: Record<string, unknown> = {}) => {
  await prisma.form.create({
    data: {
      id: FORM,
      title: "Form",
      userId: USER,
      shareId: SHARE,
      isPublished: true,
      scoring,
      questions: { create: [level] as never },
      ...data,
    },
  });
};

beforeEach(async () => {
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: USER, email: "a@b.c", password: "x" } });
  await prisma.user.create({ data: { id: "user-2", email: "b@b.c", password: "x" } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("form analytics", () => {
  it("summarizes the scores: average, extremes, categories and the histogram", async () => {
    await makeForm();
    await submit({ "q-level": "pro" });
    await submit({ "q-level": "mid" });
    await submit({ "q-level": "new" });
    await submit({});

    const res = await get("/analytics");

    expect(res.status).toBe(200);
    // The best total is 8 for everybody; the empty submit scored 0.
    expect(res.body.scoring).toMatchObject({
      enabled: true,
      scoredCount: 4,
      average: 3.25,
      min: 0,
      max: 8,
      averagePercent: 40.63,
      uncategorizedCount: 0,
      categories: [
        { id: "low", label: "Beginner", count: 2 },
        { id: "high", label: "Expert", count: 2 },
      ],
    });
    // 100%, 50%, 12.5%, 0%: 162.5 / 4 = 40.625, written with 2 decimals.
    expect(res.body.scoring.histogram.map((b: { count: number }) => b.count)).toEqual([
      1, 1, 0, 0, 0, 1, 0, 0, 0, 1,
    ]);
    expect(res.body.totalResponses).toBe(4);
  });

  it("is null for a form that never scored", async () => {
    await makeForm({ scoring: null });
    await submit({ "q-level": "pro" });

    expect((await get("/analytics")).body.scoring).toBeNull();
  });

  it("is ready, with zeros, for a form that scores but has no responses", async () => {
    await makeForm();

    expect((await get("/analytics")).body.scoring).toMatchObject({
      enabled: true,
      scoredCount: 0,
      average: 0,
      categories: [{ count: 0 }, { count: 0 }],
    });
  });

  it("is for the owner alone", async () => {
    await makeForm();

    expect((await get("/analytics", makeAuthHeader("user-2"))).status).toBe(403);
  });

  it("keeps what the responses were given when the points change later", async () => {
    await makeForm();
    await submit({ "q-level": "pro" });

    await prisma.question.update({
      where: { id: "q-level" },
      data: { options: [{ id: "pro", text: "Pro", score: 1 }] },
    });

    expect((await get("/analytics")).body.scoring).toMatchObject({ scoredCount: 1, average: 8 });
  });

  it("names the categories as they are now, and moves the ones that were deleted to 'no category'", async () => {
    await makeForm();
    await submit({ "q-level": "pro" });
    await submit({ "q-level": "new" });

    await prisma.form.update({
      where: { id: FORM },
      data: {
        scoring: {
          enabled: true,
          categories: [{ id: "high", label: "Master", min: 4, max: 10 }],
        },
      },
    });

    expect((await get("/analytics")).body.scoring).toMatchObject({
      categories: [{ id: "high", label: "Master", count: 1 }],
      uncategorizedCount: 1,
    });
  });

  it("still shows the scores after scoring is switched off", async () => {
    await makeForm();
    await submit({ "q-level": "pro" });
    await prisma.form.update({
      where: { id: FORM },
      data: { scoring: { ...scoring, enabled: false } },
    });

    expect((await get("/analytics")).body.scoring).toMatchObject({
      enabled: false,
      scoredCount: 1,
    });
  });
});

describe("the list of responses and one response", () => {
  it("carry the score, the percentage and the category by name", async () => {
    await makeForm();
    await submit({ "q-level": "pro" });

    const list = await get("/responses");

    expect(list.body.data[0].score).toEqual({
      score: 8,
      maxScore: 8,
      percent: 100,
      categoryId: "high",
      categoryLabel: "Expert",
    });
    // The list does not leak the raw columns next to it.
    expect(list.body.data[0]).not.toHaveProperty("maxScore");
    expect(list.body.data[0]).not.toHaveProperty("scoreCategoryId");

    const detail = await get(`/responses/${list.body.data[0].id}`);

    expect(detail.body.score).toMatchObject({ score: 8, categoryLabel: "Expert" });
  });

  it("have none for a response that was not scored", async () => {
    await makeForm({ scoring: null });
    await submit({ "q-level": "pro" });

    const list = await get("/responses");

    expect(list.body.data[0].score).toBeNull();
    expect((await get(`/responses/${list.body.data[0].id}`)).body.score).toBeNull();
  });
});

describe("the export of a scored form", () => {
  it("has the score columns, from the rows as the database gives them", async () => {
    await makeForm();
    await submit({ "q-level": "pro" });
    await submit({ "q-level": "new" });

    const form = await prisma.form.findUniqueOrThrow({
      where: { id: FORM },
      include: {
        questions: { orderBy: { order: "asc" } },
        responses: { orderBy: { createdAt: "asc" } },
      },
    });
    const csv = (
      await exportToCsv({
        form: {
          id: form.id,
          title: form.title,
          description: form.description,
          scoring: form.scoring,
        },
        questions: form.questions,
        responses: form.responses,
      })
    ).buffer
      .toString("utf-8")
      .replace("\uFEFF", "")
      .split("\r\n");

    expect(csv[0]).toMatch(/Бали,Максимум балів,Категорія результату$/);
    expect(csv[1]).toMatch(/,8,8,Expert$/);
    expect(csv[2]).toMatch(/,1,8,Beginner$/);
  });
});

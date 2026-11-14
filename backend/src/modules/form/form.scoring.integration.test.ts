import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Scoring over HTTP on a REAL Prisma + Postgres (PGlite): saving and validating the points and the
// categories, keeping them away from respondents, and scoring a submission.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { errorHandler } = await import("../../shared/middleware/errorHandler.js");
const { TEST_JWT_SECRET, makeAuthHeader } = await import("../../test/testApp.js");
const formRoutes = (await import("./form.routes.js")).default;
const responseRoutes = (await import("../response/response.routes.js")).default;
const quotaRoutes = (await import("../quota/quota.routes.js")).default;

const app = express();

app.use(express.json());
app.use("/api/forms", formRoutes);
app.use("/api/forms", responseRoutes);
app.use("/api/forms", quotaRoutes);
app.use(errorHandler);

const USER = "user-1";
const FORM = "form-1";
const SHARE = "share-1";
const AUTH = makeAuthHeader(USER);

const level = {
  id: "q-level",
  text: "Level",
  type: "CHOICE_SINGLE",
  order: 0,
  required: false,
  options: [
    { id: "pro", text: "Pro", score: 6 },
    { id: "new", text: "New", score: 1 },
  ],
};
const rating = {
  id: "q-rating",
  text: "Rating",
  type: "RATING",
  order: 1,
  required: false,
  config: { max: 5, scoreMultiplier: 0.5 },
};
const agree = {
  id: "q-agree",
  text: "Agree",
  type: "BOOLEAN",
  order: 2,
  required: false,
  config: { score: { true: 2, false: 0 } },
};
// Only shown to people who picked "Pro"; worth 10 points, so a hidden one must not count.
const bonus = {
  id: "q-bonus",
  text: "Bonus",
  type: "CHOICE_SINGLE",
  order: 3,
  required: false,
  options: [{ id: "yes", text: "Yes", score: 10 }],
  condition: { logic: "AND", rules: [{ questionId: "q-level", operator: "equals", value: "pro" }] },
};

const scoring = {
  enabled: true,
  categories: [
    { id: "low", label: "Beginner", min: 0, max: 5 },
    { id: "high", label: "Advanced", min: 5.01, max: 100 },
  ],
};

const questions = [level, rating, agree, bonus];

const patch = (body: Record<string, unknown>) =>
  request(app)
    .patch(`/api/forms/${FORM}`)
    .set("Authorization", AUTH)
    .send({ title: "Form", questions, scoring, ...body });

// A yes/no question has to be answered even when it is not required, so every submission has one.
const submit = (answers: Record<string, unknown>, language?: string) =>
  request(app)
    .post(`/api/forms/${SHARE}/responses`)
    .send({ answers: { "q-agree": false, ...answers }, language });

const lastResponse = () => prisma.response.findFirstOrThrow({ orderBy: { createdAt: "desc" } });

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

beforeEach(async () => {
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: USER, email: "a@b.c", password: "x" } });
  await prisma.form.create({
    data: { id: FORM, title: "Form", userId: USER, shareId: SHARE, isPublished: true },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("saving scoring", () => {
  it("stores the points and the settings, and gives them back to the owner", async () => {
    expect((await patch({})).status).toBe(200);

    const admin = await request(app).get(`/api/forms/${FORM}/admin`).set("Authorization", AUTH);

    expect(admin.body.scoring).toEqual(scoring);
    expect(
      admin.body.questions.find((q: { id: string }) => q.id === "q-level").options[0].score,
    ).toBe(6);
    expect(
      admin.body.questions.find((q: { id: string }) => q.id === "q-rating").config.scoreMultiplier,
    ).toBe(0.5);
    expect(
      admin.body.questions.find((q: { id: string }) => q.id === "q-agree").config.score,
    ).toEqual({ true: 2, false: 0 });
  });

  it("leaves scoring alone when omitted and removes it with null", async () => {
    await patch({});
    await request(app)
      .patch(`/api/forms/${FORM}`)
      .set("Authorization", AUTH)
      .send({ title: "Form", questions });

    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).scoring).toEqual(scoring);

    await patch({ scoring: null });

    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).scoring).toBeNull();
  });

  const refused = async (body: Record<string, unknown>) => {
    const res = await patch(body);

    expect(res.status).toBe(400);
    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).scoring).toBeNull();
  };

  it.each([
    ["points above the limit", { score: 1001 }],
    ["points below the limit", { score: -1001 }],
    ["more than 2 decimals", { score: 1.234 }],
    ["points that are not a number", { score: "5" }],
  ])("refuses an option with %s", async (_label, option) => {
    await refused({ questions: [{ ...level, options: [{ id: "a", text: "A", ...option }] }] });
  });

  it("refuses a scored number without a range, but allows one with it", async () => {
    const number = (config: Record<string, unknown>) => ({
      id: "q-n",
      text: "N",
      type: "NUMBER",
      order: 0,
      required: false,
      config,
    });

    await refused({ questions: [number({ scoreMultiplier: 2 })] });
    await refused({ questions: [number({ scoreMultiplier: 2, min: 0 })] });
    expect(
      (await patch({ questions: [number({ scoreMultiplier: 2, min: 0, max: 10 })] })).status,
    ).toBe(200);
    expect((await patch({ questions: [number({ scoreMultiplier: 0 })] })).status).toBe(200);
    expect((await patch({ questions: [number({})] })).status).toBe(200);
  });

  it("refuses points of a yes/no that are incomplete", async () => {
    await refused({ questions: [{ ...agree, config: { score: { true: 1 } } }] });
  });

  it("strips points that are sent for a question type that cannot be scored", async () => {
    await patch({
      questions: [
        {
          id: "q-rank",
          text: "Rank",
          type: "RANKING",
          order: 0,
          required: false,
          options: [
            { id: "a", text: "A", score: 5 },
            { id: "b", text: "B", score: 5 },
          ],
        },
      ],
    });

    const stored = await prisma.question.findUniqueOrThrow({ where: { id: "q-rank" } });

    expect(JSON.stringify(stored.options)).not.toMatch(/score/);
  });

  it.each([
    [
      "overlapping categories",
      [
        { id: "a", label: "A", min: 0, max: 10 },
        { id: "b", label: "B", min: 10, max: 20 },
      ],
    ],
    [
      "a repeated id",
      [
        { id: "a", label: "A", min: 0, max: 1 },
        { id: "a", label: "B", min: 2, max: 3 },
      ],
    ],
    ["an inverted range", [{ id: "a", label: "A", min: 5, max: 1 }]],
    ["an empty label", [{ id: "a", label: "  ", min: 0, max: 1 }]],
    [
      "more than 10",
      Array.from({ length: 11 }, (_, i) => ({
        id: `c${i}`,
        label: `C${i}`,
        min: i * 10,
        max: i * 10 + 5,
      })),
    ],
    ["bounds with 3 decimals", [{ id: "a", label: "A", min: 0.001, max: 1 }]],
  ])("refuses categories with %s", async (_label, categories) => {
    await refused({ scoring: { enabled: true, categories } });
  });

  it("refuses unknown fields in the scoring settings", async () => {
    await refused({ scoring: { enabled: true, categories: [], extra: 1 } });
  });

  it("keeps the categories of scoring that is switched off, so they survive a toggle", async () => {
    await patch({ scoring: { ...scoring, enabled: false } });

    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).scoring).toEqual({
      ...scoring,
      enabled: false,
    });
  });
});

describe("what a respondent can read", () => {
  it("never includes the points, the categories or their translated labels", async () => {
    await patch({
      defaultLanguage: "uk",
      languages: ["en"],
      translations: { en: { endText: "Bye", scoreCategories: { high: "Expert Secret" } } },
    });

    const pub = await request(app).get(`/api/forms/public/${SHARE}`);

    expect(pub.status).toBe(200);
    expect(pub.body).not.toHaveProperty("scoring");
    expect(JSON.stringify(pub.body)).not.toMatch(/score|Expert Secret|Advanced|Beginner/i);
    // The questions themselves are all there.
    expect(pub.body.questions).toHaveLength(4);
    expect(pub.body.questions[0].options.map((o: { id: string }) => o.id)).toEqual(["pro", "new"]);
    expect(pub.body.translations).toEqual({ en: { endText: "Bye" } });
  });
});

describe("scoring a submission", () => {
  it("stores the score, the best possible score and the category", async () => {
    await patch({});

    // 6 (pro) + 4 * 0.5 (rating) + 2 (agree) + 10 (bonus shown for pro) = 20, of 6 + 2.5 + 2 + 10.
    const res = await submit({
      "q-level": "pro",
      "q-rating": 4,
      "q-agree": true,
      "q-bonus": "yes",
    });

    expect(res.status).toBe(200);
    expect(await lastResponse()).toMatchObject({
      score: 20,
      maxScore: 20.5,
      scoreCategoryId: "high",
    });
  });

  it("does not count a question the respondent was not shown", async () => {
    await patch({});

    // "new" hides the bonus: its answer is not real and neither is its place in the maximum
    // (6 for the level, 2.5 for the rating, 2 for the yes/no).
    await submit({ "q-level": "new", "q-rating": 2, "q-bonus": "yes" });

    expect(await lastResponse()).toMatchObject({
      score: 2,
      maxScore: 10.5,
      scoreCategoryId: "low",
    });
  });

  it("gives no category when the total falls in none", async () => {
    await patch({
      scoring: { enabled: true, categories: [{ id: "x", label: "X", min: 50, max: 60 }] },
    });

    await submit({ "q-level": "new" });

    expect(await lastResponse()).toMatchObject({ score: 1, scoreCategoryId: null });
  });

  it.each([
    ["scoring was never set", undefined],
    ["scoring is switched off", { ...scoring, enabled: false }],
  ])("does not score when %s", async (_label, settings) => {
    await patch({ scoring: settings });

    await submit({ "q-level": "pro" });

    expect(await lastResponse()).toMatchObject({
      score: null,
      maxScore: null,
      scoreCategoryId: null,
    });
  });

  it("never sends the numbers to the respondent", async () => {
    await patch({});

    const res = await submit({ "q-level": "pro", "q-rating": 4 });

    expect(Object.keys(res.body).sort()).toEqual(["createdAt", "endScreen", "id"]);
  });

  it("does not rescore old responses when the points change", async () => {
    await patch({});
    await submit({ "q-level": "pro" });
    const before = await lastResponse();

    await patch({
      questions: [
        {
          ...level,
          options: [
            { id: "pro", text: "Pro", score: 99 },
            { id: "new", text: "New", score: 1 },
          ],
        },
      ],
    });

    expect(await prisma.response.findUniqueOrThrow({ where: { id: before.id } })).toMatchObject({
      score: before.score,
      maxScore: before.maxScore,
    });
  });
});

describe("the score on the end screen", () => {
  const rules = [
    {
      id: "expert",
      condition: { logic: "AND", rules: [{ questionId: "$score", operator: "gt", value: 15 }] },
      screen: { text: "Expert! {{score}} of {{maxScore}} points ({{percent}}%): {{category}}." },
    },
    {
      id: "weak",
      condition: { logic: "AND", rules: [{ questionId: "$percent", operator: "lt", value: 30 }] },
      screen: { text: "Keep learning: {{category}}", redirectUrl: "https://example.com/learn" },
    },
  ];

  // The form's main language is Ukrainian (the default), so decimals are written with a comma.
  it("picks the screen by the score and fills in the result", async () => {
    await patch({ endRules: rules });

    const res = await submit({
      "q-level": "pro",
      "q-rating": 4,
      "q-agree": true,
      "q-bonus": "yes",
    });

    expect(res.body.endScreen).toEqual({ text: "Expert! 20 of 20,5 points (97,56%): Advanced." });
    expect((await lastResponse()).endRuleId).toBe("expert");
  });

  it("matches on the percentage and keeps the redirect", async () => {
    await patch({ endRules: rules });

    const res = await submit({ "q-level": "new" });

    expect(res.body.endScreen).toEqual({
      text: "Keep learning: Beginner",
      redirectUrl: "https://example.com/learn",
    });
  });

  it("writes the result in the respondent's language, with the translated category", async () => {
    await patch({
      defaultLanguage: "uk",
      languages: ["en"],
      endRules: rules,
      translations: {
        en: {
          endRules: { expert: "Expert! {{score}} points, {{category}}" },
          scoreCategories: { high: "Pro level" },
        },
      },
    });

    expect((await submit({ "q-level": "pro", "q-bonus": "yes" }, "en")).body.endScreen.text).toBe(
      "Expert! 16 points, Pro level",
    );
    // Ukrainian formats the decimal sign with a comma.
    await patch({
      defaultLanguage: "uk",
      endRules: [
        {
          ...rules[0],
          condition: { logic: "AND", rules: [{ questionId: "$score", operator: "gt", value: 0 }] },
        },
      ],
    });
    expect((await submit({ "q-level": "pro", "q-rating": 3 })).body.endScreen.text).toContain(
      "7,5",
    );
  });

  it("fills the placeholders of the form's own end screen too", async () => {
    await patch({ endScreen: { text: "You got {{score}}." } });

    expect((await submit({ "q-level": "pro" })).body.endScreen.text).toBe("You got 6.");
  });

  it("leaves placeholders as they are on a form that does not score", async () => {
    await patch({ scoring: null, endScreen: { text: "You got {{score}}." } });

    expect((await submit({ "q-level": "pro" })).body.endScreen.text).toBe("You got {{score}}.");
  });
});

describe("rules on the score need scoring", () => {
  const scoreRule = {
    id: "r",
    condition: { logic: "AND", rules: [{ questionId: "$score", operator: "gt", value: 1 }] },
    screen: { text: "x" },
  };

  it("are refused while scoring is off", async () => {
    const res = await patch({ scoring: null, endRules: [scoreRule] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("FORM_INVALID_END_RULES");
    expect(res.body.errors[0]).toMatchObject({ ruleId: "r", questionId: "$score" });
  });

  it("stop scoring from being switched off while one needs it", async () => {
    expect((await patch({ endRules: [scoreRule] })).status).toBe(200);

    const res = await patch({ scoring: { ...scoring, enabled: false } });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("FORM_INVALID_END_RULES");
    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).scoring).toEqual(scoring);
  });

  it("are not allowed in quotas or in the conditions of questions", async () => {
    await patch({});

    const quota = await request(app)
      .post(`/api/forms/${FORM}/quotas`)
      .set("Authorization", AUTH)
      .send({
        name: "x",
        limit: 5,
        condition: { logic: "AND", rules: [{ questionId: "$score", operator: "gt", value: 1 }] },
      });

    expect(quota.status).toBe(400);
    expect(quota.body.message).toBe("FORM_INVALID_QUOTAS");

    const inQuestion = await patch({
      questions: [
        level,
        {
          ...rating,
          condition: { logic: "AND", rules: [{ questionId: "$score", operator: "gt", value: 1 }] },
        },
      ],
    });

    expect(inQuestion.status).toBe(400);
  });
});

describe("translations of category labels", () => {
  it("keeps those of existing categories and drops the rest", async () => {
    await patch({
      defaultLanguage: "uk",
      languages: ["en"],
      translations: { en: { scoreCategories: { high: "Expert", gone: "Old" } } },
    });

    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).translations).toEqual({
      en: { scoreCategories: { high: "Expert" } },
    });

    await patch({
      scoring: { enabled: true, categories: [{ id: "low", label: "Beginner", min: 0, max: 5 }] },
    });

    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).translations).toBeNull();
  });
});

describe("duplicating a form that scores", () => {
  it("copies the settings and the points", async () => {
    await patch({});

    const res = await request(app).post(`/api/forms/${FORM}/duplicate`).set("Authorization", AUTH);
    const copy = await prisma.form.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { questions: true },
    });

    expect(copy.scoring).toEqual(scoring);
    expect(JSON.stringify(copy.questions.find((q) => q.text === "Level")!.options)).toContain(
      '"score":6',
    );
  });
});

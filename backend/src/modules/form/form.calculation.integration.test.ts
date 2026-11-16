import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Calculation fields over HTTP on a REAL Prisma + Postgres (PGlite): saving and validating
// formulas, keeping hidden ones away from respondents, computing a submission on the server.
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

// A price in the points of an option; 1500 is above what points allowed before calculations.
const plan = {
  id: "q-plan",
  text: "Plan",
  type: "CHOICE_SINGLE",
  order: 0,
  required: false,
  options: [
    { id: "basic", text: "Basic", score: 1500 },
    { id: "pro", text: "Pro", score: 2500.5 },
  ],
};
const seats = {
  id: "q-seats",
  text: "Seats",
  type: "NUMBER",
  order: 1,
  required: false,
  config: { min: 1, max: 100 },
};
const extras = {
  id: "q-extras",
  text: "Extras",
  type: "CHOICE_MULTI",
  order: 2,
  required: false,
  options: [
    { id: "sso", text: "SSO", score: 100.25 },
    { id: "audit", text: "Audit", score: 50 },
  ],
};
// Not read by any formula: its points must stay hidden from respondents.
const quiz = {
  id: "q-quiz",
  text: "Quiz",
  type: "CHOICE_SINGLE",
  order: 3,
  required: false,
  options: [{ id: "right", text: "Right", score: 7 }],
};

const calc = (id: string, formula: string, config: Record<string, unknown> = {}, order = 10) => ({
  id,
  text: id,
  type: "CALCULATION",
  order,
  required: false,
  config: { formula, resultType: "number", ...config },
});

const total = calc("q-total", "({q:q-plan} + {q:q-extras}) * {q:q-seats} * 1.075", {
  decimals: 2,
  prefix: "$",
});

const base = [plan, seats, extras, quiz];

const patch = (body: Record<string, unknown>) =>
  request(app)
    .patch(`/api/forms/${FORM}`)
    .set("Authorization", AUTH)
    .send({ title: "Form", questions: [...base, total], ...body });

const submit = (answers: Record<string, unknown>, language?: string) =>
  request(app).post(`/api/forms/${SHARE}/responses`).send({ answers, language });

const lastResponse = () => prisma.response.findFirstOrThrow({ orderBy: { createdAt: "desc" } });

const stored = async () =>
  (await prisma.question.findMany({ where: { formId: FORM } })).map((q) => q.id).sort();

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

describe("saving calculation fields", () => {
  it("stores the formula and its settings, and points above the old limit", async () => {
    expect((await patch({})).status).toBe(200);

    const admin = await request(app).get(`/api/forms/${FORM}/admin`).set("Authorization", AUTH);
    const saved = admin.body.questions.find((q: { id: string }) => q.id === "q-total");

    expect(saved.type).toBe("CALCULATION");
    expect(saved.config).toMatchObject({ resultType: "number", decimals: 2, prefix: "$" });
    expect(saved.config.formula).toBe(total.config.formula);
    expect(
      admin.body.questions.find((q: { id: string }) => q.id === "q-plan").options[0].score,
    ).toBe(1500);
  });

  it("never lets a calculation be required", async () => {
    await patch({ questions: [...base, { ...total, required: true }] });

    expect((await prisma.question.findUniqueOrThrow({ where: { id: "q-total" } })).required).toBe(
      false,
    );
  });

  const refusedWith = async (questions: unknown[], code: string, questionId?: string) => {
    const res = await patch({ questions });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("FORM_INVALID_FORMULAS");
    expect(res.body.errors[0]).toMatchObject({ code, ...(questionId ? { questionId } : {}) });
    // Nothing was written.
    expect(await stored()).toEqual([]);
  };

  it.each([
    ["a formula that does not parse", "1 +", "UNEXPECTED_END"],
    ["an unknown question", "{q:ghost} + 1", "UNKNOWN_REFERENCE"],
    ["a function that does not exist", "FOO(1)", "UNKNOWN_FUNCTION"],
    ["a type error", '{q:q-seats} + "a"', "TYPE_MISMATCH"],
    ["a result of another type than declared", '"text"', "TYPE_MISMATCH"],
  ])("refuses %s", async (_label, formula, code) => {
    await refusedWith([...base, calc("q-total", formula)], code, "q-total");
  });

  it("refuses a calculation field that cannot be used (and its shape)", async () => {
    expect(
      (await patch({ questions: [...base, calc("q-total", "1", { decimals: 9 })] })).status,
    ).toBe(400);
    expect(
      (await patch({ questions: [...base, calc("q-total", "1", { resultType: "date" })] })).status,
    ).toBe(400);
    expect((await patch({ questions: [...base, calc("q-total", "")] })).status).toBe(400);
    expect((await patch({ questions: [...base, calc("q-total", "1".repeat(501))] })).status).toBe(
      400,
    );
  });

  it("refuses a circle between calculation fields", async () => {
    await refusedWith(
      [...base, calc("q-a", "{q:q-b}", {}, 10), calc("q-b", "{q:q-a}", {}, 11)],
      "FORMULA_CYCLE",
    );
  });

  it("refuses a visible calculation that reads a hidden one", async () => {
    await refusedWith(
      [
        ...base,
        calc("q-secret", "{q:q-seats}", { display: "hidden" }, 10),
        calc("q-shown", "{q:q-secret} + 1", {}, 11),
      ],
      "HIDDEN_REFERENCE",
      "q-shown",
    );
  });

  it("refuses more than 30 calculation fields", async () => {
    const many = Array.from({ length: 31 }, (_, i) => calc(`q-c${i}`, "1", {}, 10 + i));

    await refusedWith([...base, ...many], "TOO_MANY_CALCULATIONS");
  });

  it("stops a question from being deleted while a formula reads it", async () => {
    await patch({});

    const res = await patch({ questions: [plan, extras, quiz, total] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("FORM_INVALID_FORMULAS");
    expect(res.body.errors[0]).toMatchObject({ code: "UNKNOWN_REFERENCE", questionId: "q-total" });
    expect(await stored()).toContain("q-seats");
  });
});

describe("where a calculation can be looked at", () => {
  it("not in the condition of a question", async () => {
    const res = await patch({
      questions: [
        ...base,
        total,
        {
          id: "q-late",
          text: "Late",
          type: "TEXT",
          order: 20,
          required: false,
          condition: {
            logic: "AND",
            rules: [{ questionId: "q-total", operator: "gt", value: 100 }],
          },
        },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("FORM_INVALID_CONDITIONS");
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({ questionId: "q-late", reason: "CALCULATION_REFERENCE" }),
    );
  });

  it("not in a quota", async () => {
    await patch({});

    const quota = await request(app)
      .post(`/api/forms/${FORM}/quotas`)
      .set("Authorization", AUTH)
      .send({
        name: "x",
        limit: 5,
        condition: { logic: "AND", rules: [{ questionId: "q-total", operator: "gt", value: 1 }] },
      });

    expect(quota.status).toBe(400);
    expect(quota.body.message).toBe("FORM_INVALID_QUOTAS");
  });

  it("yes in an end rule", async () => {
    const res = await patch({
      endRules: [
        {
          id: "big",
          condition: { logic: "AND", rules: [{ questionId: "q-total", operator: "gt", value: 1 }] },
          screen: { text: "x" },
        },
      ],
    });

    expect(res.status).toBe(200);
  });
});

describe("computing a submission", () => {
  const answers = { "q-plan": "pro", "q-seats": 3, "q-extras": ["sso", "audit"] };

  // (2500.5 + 100.25 + 50) * 3 * 1.075 = 2650.75 * 3.225 = 8548.66875, rounded to 8548.67
  it("computes the value exactly and stores it with the answers", async () => {
    await patch({});

    const res = await submit(answers);

    expect(res.status).toBe(200);
    expect((await lastResponse()).answers).toMatchObject({ "q-total": 8548.67, "q-seats": 3 });
  });

  it("ignores a value the respondent sends", async () => {
    await patch({});
    await submit({ ...answers, "q-total": 1 });

    expect((await lastResponse()).answers).toMatchObject({ "q-total": 8548.67 });
  });

  it("treats a question that was not shown as empty", async () => {
    await patch({
      questions: [
        plan,
        seats,
        {
          ...extras,
          condition: {
            logic: "AND",
            rules: [{ questionId: "q-plan", operator: "equals", value: "basic" }],
          },
        },
        quiz,
        total,
      ],
    });
    await submit(answers);

    // The extras were not shown to a "pro" respondent: (2500.5 + 0) * 3 * 1.075 = 8064.1125 -> 8064.11
    expect((await lastResponse()).answers).toMatchObject({ "q-total": 8064.11 });
  });

  it("stores no value for a calculation that failed, and still accepts the response", async () => {
    await patch({
      questions: [...base, calc("q-total", "{q:q-plan} / ({q:q-seats} - {q:q-seats})")],
    });

    const res = await submit(answers);

    expect(res.status).toBe(200);
    expect((await lastResponse()).answers).not.toHaveProperty("q-total");
  });

  it("calculation fields read each other in dependency order", async () => {
    await patch({
      questions: [
        ...base,
        calc("q-b", "{q:q-a} * 2", {}, 11),
        calc("q-a", "{q:q-seats} + 1", {}, 12),
      ],
    });
    await submit(answers);

    expect((await lastResponse()).answers).toMatchObject({ "q-a": 4, "q-b": 8 });
  });

  it("stores a text and a yes/no result", async () => {
    await patch({
      questions: [
        ...base,
        calc(
          "q-label",
          'CONCAT(LABEL({q:q-plan}), " x", {q:q-seats})',
          { resultType: "string" },
          11,
        ),
        calc("q-big", "{q:q-seats} > 2", { resultType: "boolean" }, 12),
      ],
    });
    await submit(answers);

    expect((await lastResponse()).answers).toMatchObject({ "q-label": "Pro x3", "q-big": true });
  });

  it("keeps the value of a hidden calculation (end rules, export) without showing it", async () => {
    await patch({
      questions: [...base, calc("q-lead", "{q:q-seats} * 10", { display: "hidden" })],
    });
    await submit(answers);

    expect((await lastResponse()).answers).toMatchObject({ "q-lead": 30 });
  });
});

describe("the end screen", () => {
  const rules = [
    {
      id: "big",
      condition: { logic: "AND", rules: [{ questionId: "q-total", operator: "gt", value: 5000 }] },
      screen: { text: "Your total: {{calc:q-total}}. Seats: {{calc:q-missing}}" },
    },
  ];

  it("picks the screen by a computed value and writes the value into the text", async () => {
    await patch({ defaultLanguage: "en", endRules: rules });

    const res = await submit({ "q-plan": "pro", "q-seats": 3, "q-extras": ["sso", "audit"] });

    expect(res.body.endScreen).toEqual({ text: "Your total: $8,548.67. Seats: —" });
    expect((await lastResponse()).endRuleId).toBe("big");
  });

  it("fills the placeholder of the form's own end screen, in the respondent's language", async () => {
    await patch({ defaultLanguage: "uk", endScreen: { text: "Разом: {{calc:q-total}}" } });

    const res = await submit({ "q-plan": "basic", "q-seats": 2, "q-extras": [] });

    // 1500 * 2 * 1.075 = 3225 ("uk" groups with a space and a comma for the decimals).
    expect(res.body.endScreen.text).toMatch(/^Разом: \$3\s225,00$/);
  });

  it("shows a dash for a value that could not be computed", async () => {
    await patch({
      questions: [...base, calc("q-total", "1 / 0")],
      endScreen: { text: "Total {{calc:q-total}}" },
    });

    const res = await submit({ "q-plan": "basic" });

    expect(res.body.endScreen.text).toBe("Total —");
  });
});

describe("what a respondent can read", () => {
  it("gets the formula of a visible calculation and the points it needs, nothing else", async () => {
    await patch({
      questions: [...base, total, calc("q-secret", "{q:q-seats} * 99", { display: "hidden" }, 11)],
    });

    const pub = await request(app).get(`/api/forms/public/${SHARE}`);
    const byId = (id: string) => pub.body.questions.find((q: { id: string }) => q.id === id);

    expect(pub.status).toBe(200);
    expect(byId("q-total").config.formula).toBe(total.config.formula);
    // The prices the visible formula reads...
    expect(byId("q-plan").options.map((o: { score: number }) => o.score)).toEqual([1500, 2500.5]);
    expect(byId("q-extras").options.map((o: { score: number }) => o.score)).toEqual([100.25, 50]);
    // ...but not the points of a question that no visible formula reads.
    expect(byId("q-quiz").options[0]).not.toHaveProperty("score");
    // A hidden calculation does not exist for the respondent: not even its formula.
    expect(byId("q-secret")).toBeUndefined();
    expect(JSON.stringify(pub.body)).not.toContain("* 99");
  });

  it("does not receive the points when no visible formula reads them", async () => {
    await patch({ questions: [...base, calc("q-secret", "{q:q-plan}", { display: "hidden" })] });

    const pub = await request(app).get(`/api/forms/public/${SHARE}`);

    expect(JSON.stringify(pub.body)).not.toMatch(/"score"/);
  });
});

describe("duplicating a form with calculations", () => {
  it("points the copied formulas at the copied questions", async () => {
    await patch({});

    const res = await request(app).post(`/api/forms/${FORM}/duplicate`).set("Authorization", AUTH);
    const copy = await prisma.form.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { questions: true },
    });
    const ids = new Set(copy.questions.map((q) => q.id));
    const copied = copy.questions.find((q) => q.type === "CALCULATION")!;
    const formula = (copied.config as { formula: string }).formula;
    const refs = [...formula.matchAll(/\{q:([^}]+)\}/g)].map((m) => m[1]!);

    expect(refs).toHaveLength(3);
    expect(refs.every((id) => ids.has(id))).toBe(true);
    expect(refs.some((id) => id.startsWith("q-"))).toBe(false);
  });
});

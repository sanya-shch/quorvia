import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// The whole path over HTTP on a REAL Prisma + Postgres (PGlite), without mocked services: the owner
// saves end rules, a respondent reads the public form and submits. It checks what only the HTTP
// layer shows: the status and body of the refusal, and that the rules never reach the respondent.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { errorHandler } = await import("../../shared/middleware/errorHandler.js");
const { TEST_JWT_SECRET, makeAuthHeader } = await import("../../test/testApp.js");
const formRoutes = (await import("./form.routes.js")).default;
const responseRoutes = (await import("../response/response.routes.js")).default;

const app = express();

app.use(express.json());
app.use("/api/forms", formRoutes);
app.use("/api/forms", responseRoutes);
app.use(errorHandler);

const USER = "user-1";
const FORM = "form-1";
const SHARE = "share-1";
const AUTH = makeAuthHeader(USER);

const score = { id: "q-score", text: "Score", type: "NUMBER", order: 0, required: false };

const high = {
  id: "high",
  condition: { logic: "AND", rules: [{ questionId: "q-score", operator: "gt", value: 8 }] },
  screen: { text: "Secret outcome: VIP", redirectUrl: "https://example.com/vip" },
};

const patch = (body: Record<string, unknown>) =>
  request(app)
    .patch(`/api/forms/${FORM}`)
    .set("Authorization", AUTH)
    .send({ title: "Form", questions: [score], ...body });

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

describe("end rules over HTTP", () => {
  it("saves the rules for the owner", async () => {
    const res = await patch({ endRules: [high] });

    expect(res.status).toBe(200);

    const admin = await request(app).get(`/api/forms/${FORM}/admin`).set("Authorization", AUTH);

    expect(admin.status).toBe(200);
    expect(admin.body.endRules).toEqual([high]);
  });

  it("answers 400 FORM_INVALID_END_RULES with what is wrong", async () => {
    const res = await patch({
      endRules: [
        {
          ...high,
          condition: { logic: "AND", rules: [{ questionId: "nope", operator: "gt", value: 1 }] },
        },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "FORM_INVALID_END_RULES",
      errors: [{ ruleId: "high", questionId: "nope", reason: "UNKNOWN_QUESTION" }],
    });
  });

  it("answers 400 for a redirect that is not http(s), and stores nothing", async () => {
    const res = await patch({
      endRules: [{ ...high, screen: { text: "x", redirectUrl: "javascript:alert(1)" } }],
    });

    expect(res.status).toBe(400);
    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).endRules).toBeNull();
  });

  it("does not let another user change the rules", async () => {
    const res = await request(app)
      .patch(`/api/forms/${FORM}`)
      .set("Authorization", makeAuthHeader("someone-else"))
      .send({ title: "Form", questions: [score], endRules: [high] });

    expect(res.status).toBeGreaterThanOrEqual(403);
    expect((await prisma.form.findUniqueOrThrow({ where: { id: FORM } })).endRules).toBeNull();
  });

  it("keeps the rules out of everything a respondent can read", async () => {
    await patch({
      defaultLanguage: "uk",
      languages: ["en"],
      endRules: [high],
      endScreen: { text: "Thanks" },
      translations: { en: { endText: "Thanks (en)", endRules: { high: "Secret outcome (en)" } } },
    });

    const pub = await request(app).get(`/api/forms/public/${SHARE}`);

    expect(pub.status).toBe(200);
    expect(pub.body).not.toHaveProperty("endRules");
    expect(pub.body.endScreen).toEqual({ text: "Thanks" });
    expect(JSON.stringify(pub.body)).not.toMatch(/Secret outcome|example\.com\/vip|"high"/);
  });

  it("returns the screen of the matching rule on submit, and nothing else about the rules", async () => {
    await patch({ endRules: [high], endScreen: { text: "Thanks" } });

    const vip = await request(app)
      .post(`/api/forms/${SHARE}/responses`)
      .send({ answers: { "q-score": 9 } });

    expect(vip.status).toBe(200);
    expect(vip.body.endScreen).toEqual({
      text: "Secret outcome: VIP",
      redirectUrl: "https://example.com/vip",
    });
    expect(Object.keys(vip.body).sort()).toEqual(["createdAt", "endScreen", "id"]);

    const other = await request(app)
      .post(`/api/forms/${SHARE}/responses`)
      .send({ answers: { "q-score": 2 } });

    expect(other.body.endScreen).toEqual({ text: "Thanks" });
    expect(
      (await prisma.response.findMany({ orderBy: { createdAt: "asc" } })).map((r) => r.endRuleId),
    ).toEqual(["high", null]);
  });
});

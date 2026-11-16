import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

// CALCULATION in the analytics overview, in the detailed analytics and in the response breakdown
// (real Prisma + PGlite with migrations).
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { getFormAnalytics, getQuestionAnalytics, getResponseById } =
  await import("./analytics.service.js");

const USER = "user-calc";
const FORM = "form-calc";

const calc = (id: string, order: number, config: Record<string, unknown>) => ({
  id,
  text: id,
  type: "CALCULATION" as const,
  order,
  formId: FORM,
  config: config as Prisma.InputJsonObject,
});

beforeAll(async () => {
  await prisma.user.create({ data: { id: USER, email: "c@b.c", password: "x" } });
  await prisma.form.create({ data: { id: FORM, title: "F", userId: USER, shareId: "share-c" } });
  await prisma.question.createMany({
    data: [
      calc("q-total", 0, { formula: "1", resultType: "number", decimals: 2, prefix: "$" }),
      calc("q-label", 1, { formula: "1", resultType: "string" }),
      calc("q-big", 2, { formula: "1", resultType: "boolean" }),
      calc("q-empty", 3, { formula: "1", resultType: "number" }),
    ],
  });

  const answers: Record<string, unknown>[] = [
    { "q-total": 100, "q-label": "small", "q-big": false },
    { "q-total": 250.5, "q-label": "large", "q-big": true },
    // The total could not be computed for this one: nothing is stored for it.
    { "q-label": "small", "q-big": false },
    { "q-total": 49.5, "q-label": "small", "q-big": false },
  ];

  await prisma.response.createMany({
    data: answers.map((a, i) => ({
      id: `resp-c-${i}`,
      formId: FORM,
      answers: a as Prisma.InputJsonObject,
      visibleQuestionIds: ["q-total", "q-label", "q-big", "q-empty"],
      language: i === 1 ? "en" : null,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    })),
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("analytics of a calculation field", () => {
  it("overview: min / avg / max of a number result, over the values that were computed", async () => {
    const overview = await getFormAnalytics(FORM, USER);
    const total = overview.questions.find((q) => q.id === "q-total")!;

    if (total.type !== "CALCULATION") throw new Error("unreachable");

    expect(total.resultType).toBe("number");
    expect(total.stats).toEqual({ avg: 400 / 3, min: 49.5, max: 250.5 });
  });

  it("overview: a text or yes/no result has no numbers", async () => {
    const overview = await getFormAnalytics(FORM, USER);

    for (const [id, resultType] of [
      ["q-label", "string"],
      ["q-big", "boolean"],
    ] as const) {
      const question = overview.questions.find((q) => q.id === id)!;

      if (question.type !== "CALCULATION") throw new Error("unreachable");

      expect(question.resultType).toBe(resultType);
      expect(question.stats).toBeUndefined();
    }
  });

  it("overview: a number result nobody has a value for has no stats", async () => {
    const empty = (await getFormAnalytics(FORM, USER)).questions.find((q) => q.id === "q-empty")!;

    if (empty.type !== "CALCULATION") throw new Error("unreachable");

    expect(empty.stats).toBeUndefined();
  });

  it("has no detailed view: it is refused as unsupported", async () => {
    await expect(getQuestionAnalytics(FORM, "q-total", USER)).rejects.toThrow(
      "ANALYTICS_UNSUPPORTED_TYPE",
    );
  });

  it("a response shows the value as the respondent read it", async () => {
    // No language stored: the admin default, Ukrainian (a comma for the decimals).
    const first = await getResponseById(FORM, "resp-c-0", USER);
    const byId = Object.fromEntries(first.answers.map((a) => [a.questionId, a.displayValue]));

    expect(byId).toEqual({ "q-total": "$100,00", "q-label": "small", "q-big": "Ні" });

    // A response given in English is written the English way.
    const second = await getResponseById(FORM, "resp-c-1", USER);
    const english = Object.fromEntries(second.answers.map((a) => [a.questionId, a.displayValue]));

    expect(english).toEqual({ "q-total": "$250.50", "q-label": "large", "q-big": "Yes" });
  });

  it("a value that was not computed is simply not listed", async () => {
    const third = await getResponseById(FORM, "resp-c-2", USER);

    expect(third.answers.map((a) => a.questionId)).not.toContain("q-total");
  });
});

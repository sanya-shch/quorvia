import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

// RANKING in analytics and in the response breakdown (real Prisma + PGlite with migrations).
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { getFormAnalytics, getQuestionAnalytics, getResponseById } = await import(
  "./analytics.service.js"
);

const USER = "user-rank";
const FORM = "form-rank";
const Q = "q-rank";

const options = [
  { id: "a", text: "Кава", isDefault: false },
  { id: "b", text: "Чай", isDefault: false },
  { id: "c", text: "Какао", isDefault: false },
];

beforeAll(async () => {
  await prisma.user.create({ data: { id: USER, email: "r@b.c", password: "x" } });
  await prisma.form.create({ data: { id: FORM, title: "F", userId: USER, shareId: "share-r" } });
  await prisma.question.create({
    data: { id: Q, text: "Ранжуйте", type: "RANKING", order: 0, formId: FORM, options },
  });

  const rankings: unknown[] = [
    ["a", "b", "c"],
    ["a", "c", "b"],
    ["b", "a", "c"],
    // invalid ones (old data after the options changed): incomplete, duplicate, foreign id
    ["a", "b"],
    ["a", "a", "b"],
    ["a", "b", "gone"],
  ];

  await prisma.response.createMany({
    data: rankings.map((ranking, i) => ({
      id: `resp-r-${i}`,
      formId: FORM,
      answers: { [Q]: ranking } as Prisma.InputJsonObject,
      visibleQuestionIds: [Q],
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    })),
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("аналітика RANKING", () => {
  it("деталі: середні позиції та розподіл по позиціях лише за повними ранжуваннями", async () => {
    const detail = await getQuestionAnalytics(FORM, Q, USER);

    if (!("ranking" in detail)) throw new Error("unreachable");

    expect(detail.totalAnswers).toBe(6);
    expect(detail.rankedCount).toBe(3);

    const byId = Object.fromEntries(detail.ranking.map((r) => [r.optionId, r]));

    expect(byId.a.positions).toEqual([2, 1, 0]);
    expect(byId.a.avgPosition).toBeCloseTo(4 / 3);
    expect(byId.b.positions).toEqual([1, 1, 1]);
    expect(byId.b.avgPosition).toBe(2);
    expect(byId.c.positions).toEqual([0, 1, 2]);
    expect(byId.c.avgPosition).toBeCloseTo(8 / 3);
    // order and labels as in the question
    expect(detail.ranking.map((r) => r.text)).toEqual(["Кава", "Чай", "Какао"]);
  });

  it("огляд форми віддає ту саму статистику", async () => {
    const overview = await getFormAnalytics(FORM, USER);
    const question = overview.questions.find((x) => x.id === Q)!;

    if (question.type !== "RANKING") throw new Error("unreachable");

    expect(question.rankedCount).toBe(3);
    expect(question.ranking[0].avgPosition).toBeCloseTo(4 / 3);
  });

  it("без повних ранжувань avgPosition = null, а не NaN", async () => {
    await prisma.form.create({ data: { id: "form-rank-empty", title: "E", userId: USER, shareId: "re" } });
    await prisma.question.create({
      data: { id: "q-rank-empty", text: "R", type: "RANKING", order: 0, formId: "form-rank-empty", options },
    });

    const overview = await getFormAnalytics("form-rank-empty", USER);
    const question = overview.questions[0];

    if (question.type !== "RANKING") throw new Error("unreachable");

    expect(question.rankedCount).toBe(0);
    expect(question.ranking.every((r) => r.avgPosition === null)).toBe(true);
    expect(question.ranking[0].positions).toEqual([0, 0, 0]);
  });

  it("розшифровка відповіді: нумерований список текстів у порядку ранжування", async () => {
    const detail = await getResponseById(FORM, "resp-r-2", USER);

    expect(detail.answers[0].displayValue).toEqual(["1. Чай", "2. Кава", "3. Какао"]);
  });
});

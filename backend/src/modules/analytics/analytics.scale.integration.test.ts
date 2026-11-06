import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

// RATING / SCALE / NPS on a real Prisma + Postgres (PGlite with the project's migrations); it
// also checks that the migration with the new enum values applies.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { getFormAnalytics, getQuestionAnalytics, getResponses } = await import(
  "./analytics.service.js"
);
const { formatAnswer } = await import("../export/exporters/formatAnswer.js");

const USER = "user-scale";
const FORM = "form-scale";
const Q = { rating: "q-rating", scale: "q-scale", nps: "q-nps" };

// NPS: 10, 9, 9 -> promoters 3; 8, 7 -> passives 2; 6, 0 -> detractors 2 (7 in total)
const NPS = [10, 9, 9, 8, 7, 6, 0];
// RATING (max 5): 5, 4, 4, 1 + 9 (out of scale, the config used to be wider) + 2.5 (not an integer)
const RATING = [5, 4, 4, 1, 9, 2.5];
const SCALE = [0, 4, 4];

beforeAll(async () => {
  await prisma.user.create({ data: { id: USER, email: "s@b.c", password: "x" } });
  await prisma.form.create({ data: { id: FORM, title: "F", userId: USER, shareId: "share-s" } });
  await prisma.question.createMany({
    data: [
      { id: Q.rating, text: "Rating", type: "RATING", order: 0, formId: FORM, config: { max: 5 } },
      {
        id: Q.scale,
        text: "Scale",
        type: "SCALE",
        order: 1,
        formId: FORM,
        config: { min: 0, max: 4, minLabel: "Ні", maxLabel: "Так" },
      },
      { id: Q.nps, text: "NPS", type: "NPS", order: 2, formId: FORM },
    ],
  });

  const rows = Array.from({ length: 7 }, (_, i) => {
    const answers: Record<string, unknown> = { [Q.nps]: NPS[i] };
    if (RATING[i] !== undefined) answers[Q.rating] = RATING[i];
    if (SCALE[i] !== undefined) answers[Q.scale] = SCALE[i];

    return {
      id: `resp-s-${i}`,
      formId: FORM,
      answers: answers as Prisma.InputJsonObject,
      visibleQuestionIds: Object.values(Q),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    };
  });
  await prisma.response.createMany({ data: rows });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("аналітика шкальних питань", () => {
  it("огляд: повний діапазон шкали з нулями, статистика лише по значеннях у межах", async () => {
    const overview = await getFormAnalytics(FORM, USER);
    const rating = overview.questions.find((q) => q.id === Q.rating)!;

    expect(rating.type).toBe("RATING");
    if (rating.type !== "RATING") throw new Error("unreachable");

    expect(rating.distribution.map((d) => [d.optionId, d.count])).toEqual([
      ["1", 1],
      ["2", 0],
      ["3", 0],
      ["4", 2],
      ["5", 1],
    ]);
    // 9 and 2.5 are not counted: (5 + 4 + 4 + 1) / 4
    expect(rating.stats).toEqual({ avg: 3.5, min: 1, max: 5 });
    expect(rating.nps).toBeUndefined();
    expect(rating.shownCount).toBe(7);
    // 7 respondents saw the question, 6 answered (the RATING array has 6 values)
    expect(rating.skippedCount).toBe(1);
  });

  it("огляд: SCALE із нуля й NPS з розбивкою та score", async () => {
    const overview = await getFormAnalytics(FORM, USER);
    const scale = overview.questions.find((q) => q.id === Q.scale)!;
    const nps = overview.questions.find((q) => q.id === Q.nps)!;

    if (scale.type !== "SCALE" || nps.type !== "NPS") throw new Error("unreachable");

    expect(scale.distribution.map((d) => d.count)).toEqual([1, 0, 0, 0, 2]);
    expect(scale.stats.avg).toBeCloseTo(8 / 3);

    expect(nps.distribution).toHaveLength(11);
    expect(nps.nps).toEqual({
      promoters: 3,
      passives: 2,
      detractors: 2,
      // (3 - 2) / 7 * 100 = 14.285... -> 14.3
      score: 14.3,
    });
  });

  it("деталі питання: розподіл по всій шкалі, totalAnswers рахує й значення поза межами", async () => {
    const rating = await getQuestionAnalytics(FORM, Q.rating, USER);
    const nps = await getQuestionAnalytics(FORM, Q.nps, USER);

    if (rating.question.type !== "RATING" || !("stats" in rating)) throw new Error("unreachable");

    expect(rating.totalAnswers).toBe(6);
    expect(rating.distribution).toEqual([
      { value: 1, count: 1 },
      { value: 2, count: 0 },
      { value: 3, count: 0 },
      { value: 4, count: 2 },
      { value: 5, count: 1 },
    ]);
    expect(rating.stats.avg).toBe(3.5);

    if (!("nps" in nps)) throw new Error("unreachable");
    expect(nps.nps?.score).toBe(14.3);
    expect(nps.stats).toMatchObject({ min: 0, max: 10 });
  });

  it("NPS без відповідей: score null, а не NaN", async () => {
    await prisma.form.create({ data: { id: "form-empty", title: "E", userId: USER, shareId: "e" } });
    await prisma.question.create({
      data: { id: "q-empty-nps", text: "NPS", type: "NPS", order: 0, formId: "form-empty" },
    });

    const overview = await getFormAnalytics("form-empty", USER);
    const nps = overview.questions[0];

    if (nps.type !== "NPS") throw new Error("unreachable");
    expect(nps.nps).toEqual({ promoters: 0, passives: 0, detractors: 0, score: null });
    expect(nps.stats).toEqual({ avg: 0, min: 0, max: 0 });
  });

  it("відповідь респондента показується числом, експорт - сирим числом", async () => {
    const list = await getResponses(FORM, USER, 1, 1);
    expect(list.total).toBe(7);

    const question = await prisma.question.findUniqueOrThrow({ where: { id: Q.nps } });

    expect(formatAnswer(question, 0)).toBe("0");
    expect(formatAnswer(question, 9)).toBe("9");
  });
});

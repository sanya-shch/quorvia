import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { Prisma } from "@prisma/client";

/**
 * Інтеграційний тест аналітики на РЕАЛЬНОМУ Prisma-клієнті й Postgres
 * (PGlite у WASM, міграції проєкту) - без моків findMany. Головна перевірка:
 * порційний (keyset) обхід дає той самий результат, що й читання одним
 * запитом, у тому числі коли в багатьох рядків однаковий createdAt.
 */
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { analyticsConfig } = await import("./analytics.config.js");
const { getFormAnalytics, getQuestionAnalytics, getFormPaths, getFormFunnel, getResponses } =
  await import("./analytics.service.js");

const USER = "user-1";
const FORM = "form-1";
const Q = { text: "q-text", num: "q-num", bool: "q-bool", single: "q-single", multi: "q-multi" };
const OPTIONS = [
  { id: "opt-a", text: "A" },
  { id: "opt-b", text: "B" },
];

// 11 відповідей; created-at навмисно з дублікатами (тайбрейк за id).
const TEXTS = ["a", "b", "a", "constructor", "__proto__", "a", "b", "constructor", undefined, "a", "toString"];
const NUMS = [10, 20, 20, 5, 1.5, undefined, 100, 7, 3, 3, 12];
const BOOLS = [true, false, true, true, undefined, false, true, false, true, true, false];
const SINGLES = ["opt-a", "opt-b", "opt-a", "opt-a", undefined, "opt-b", "opt-a", "opt-b", "opt-a", "opt-a", "opt-b"];
const MULTIS = [["opt-a"], ["opt-a", "opt-b"], [], ["opt-b"], undefined, ["opt-a"], ["opt-a", "opt-b"], [], ["opt-b"], ["opt-a"], ["opt-b"]];

const responseRows = TEXTS.map((_, i) => {
  const answers: Record<string, unknown> = {};
  if (TEXTS[i] !== undefined) answers[Q.text] = TEXTS[i];
  if (NUMS[i] !== undefined) answers[Q.num] = NUMS[i];
  if (BOOLS[i] !== undefined) answers[Q.bool] = BOOLS[i];
  if (SINGLES[i] !== undefined) answers[Q.single] = SINGLES[i];
  if (MULTIS[i] !== undefined) answers[Q.multi] = MULTIS[i];

  return {
    id: `resp-${String(i).padStart(2, "0")}`,
    formId: FORM,
    answers: answers as Prisma.InputJsonObject,
    // перші 8 - явні visible; останні 3 - legacy (null), видимість виводиться з answers
    visibleQuestionIds: i < 8 ? Object.values(Q) : undefined,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(i / 4))), // по 4 рядки з однаковим createdAt
  };
});

const withBatchSize = async <T>(size: number, fn: () => Promise<T>): Promise<T> => {
  const previous = analyticsConfig.batchSize;
  analyticsConfig.batchSize = size;
  try {
    return await fn();
  } finally {
    analyticsConfig.batchSize = previous;
  }
};

beforeAll(async () => {
  await prisma.user.create({ data: { id: USER, email: "a@b.c", password: "x" } });
  await prisma.form.create({ data: { id: FORM, title: "F", userId: USER, shareId: "share-1" } });
  await prisma.question.createMany({
    data: [
      { id: Q.text, text: "Text", type: "TEXT", order: 0, formId: FORM },
      { id: Q.num, text: "Num", type: "NUMBER", order: 1, formId: FORM },
      { id: Q.bool, text: "Bool", type: "BOOLEAN", order: 2, formId: FORM },
      { id: Q.single, text: "Single", type: "CHOICE_SINGLE", order: 3, formId: FORM, options: OPTIONS },
      { id: Q.multi, text: "Multi", type: "CHOICE_MULTI", order: 4, formId: FORM, options: OPTIONS },
    ],
  });
  await prisma.response.createMany({ data: responseRows });

  // 9 проходжень: 4 завершені; першим двом reached ще немає (legacy -> fallback на visible)
  await prisma.responseAttempt.createMany({
    data: Array.from({ length: 9 }, (_, i) => ({
      id: `att-${i}`,
      formId: FORM,
      sessionKey: `session-${String(i).padStart(2, "0")}`,
      answers: {},
      visibleQuestionIds: Object.values(Q),
      reachedQuestionIds: i < 2 ? undefined : Object.values(Q).slice(0, (i % 5) + 1),
      completedAt: i % 2 === 0 ? new Date() : null,
    })),
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("аналітика на реальному Prisma + Postgres", () => {
  it("порційний обхід (по 3 і по 1 рядку) дає той самий результат, що й один запит", async () => {
    const run = async () => ({
      overview: await getFormAnalytics(FORM, USER),
      paths: await getFormPaths(FORM, USER),
      funnel: await getFormFunnel(FORM, USER),
      questions: await Promise.all(Object.values(Q).map((id) => getQuestionAnalytics(FORM, id, USER))),
    });

    const whole = await withBatchSize(2000, run);
    const by3 = await withBatchSize(3, run);
    const by1 = await withBatchSize(1, run);

    expect(by3).toEqual(whole);
    expect(by1).toEqual(whole);
  });

  it("не втрачає і не дублює рядки на межах порцій при однакових createdAt", async () => {
    const overview = await withBatchSize(4, () => getFormAnalytics(FORM, USER));
    expect(overview.totalResponses).toBe(11);

    const paths = await withBatchSize(4, () => getFormPaths(FORM, USER));
    expect(paths.totalResponses).toBe(11);
  });

  it("totalResponses, статистика й розподіли збігаються з незалежним підрахунком", async () => {
    const nums = NUMS.filter((n): n is number => n !== undefined);

    const num = (await withBatchSize(3, () => getQuestionAnalytics(FORM, Q.num, USER))) as any;
    expect(num.totalAnswers).toBe(nums.length);
    expect(num.stats).toEqual({
      avg: nums.reduce((a, b) => a + b, 0) / nums.length,
      min: Math.min(...nums),
      max: Math.max(...nums),
    });
    expect(num.distribution.map((d: any) => d.value)).toEqual([...new Set(nums)].sort((a, b) => a - b));

    const bool = (await getQuestionAnalytics(FORM, Q.bool, USER)) as any;
    expect(bool.trueCount).toBe(BOOLS.filter((v) => v === true).length);
    expect(bool.falseCount).toBe(BOOLS.filter((v) => v === false).length);

    const multi = (await withBatchSize(2, () => getQuestionAnalytics(FORM, Q.multi, USER))) as any;
    expect(multi.distribution).toEqual([
      { optionId: "opt-a", text: "A", count: MULTIS.flat().filter((v) => v === "opt-a").length },
      { optionId: "opt-b", text: "B", count: MULTIS.flat().filter((v) => v === "opt-b").length },
    ]);
  });

  it("текст зі збігом із ключами Object.prototype (constructor, __proto__, toString) рахується коректно", async () => {
    const result = (await withBatchSize(3, () => getQuestionAnalytics(FORM, Q.text, USER))) as any;
    const byValue = Object.fromEntries(result.distribution.map((d: any) => [d.value, d.count]));

    expect(byValue.constructor).toBe(2);
    expect(byValue["__proto__"]).toBe(1);
    expect(byValue.toString).toBe(1);
    expect(byValue.a).toBe(4);
    // розподіл відсортований за частотою
    expect(result.distribution[0]).toEqual({ value: "a", count: 4 });
    expect(result.answersTruncated).toBe(false);
  });

  it("обрізає список сирих текстових відповідей і позначає це", async () => {
    const previous = analyticsConfig.maxTextAnswers;
    analyticsConfig.maxTextAnswers = 3;
    try {
      const result = (await getQuestionAnalytics(FORM, Q.text, USER)) as any;
      expect(result.answers).toHaveLength(3);
      expect(result.answersTruncated).toBe(true);
      expect(result.totalAnswers).toBe(TEXTS.filter((t) => t !== undefined).length); // повна кількість
    } finally {
      analyticsConfig.maxTextAnswers = previous;
    }
  });

  it("funnel: проходження порціями; для legacy-рядків без reached - fallback на visible", async () => {
    const funnel = await withBatchSize(2, () => getFormFunnel(FORM, USER));

    expect(funnel.totalAttempts).toBe(9);
    expect(funnel.totalCompletions).toBe(5); // i = 0,2,4,6,8
    // Перше питання бачать усі 9 (legacy -> усі 5 visible, решта -> щонайменше 1)
    expect(funnel.nodes[0].reachedCount).toBe(9);
  });

  it("список відповідей: сторінки не перетинаються навіть при однакових createdAt", async () => {
    const pages = await Promise.all([1, 2, 3].map((p) => getResponses(FORM, USER, p, 4)));
    const ids = pages.flatMap((p) => p.data.map((r) => r.id));

    expect(pages[0].total).toBe(11);
    expect(ids).toHaveLength(11);
    expect(new Set(ids).size).toBe(11);
  });
});

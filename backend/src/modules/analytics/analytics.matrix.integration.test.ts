import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

/** MATRIX в аналітиці та розшифровці відповіді (реальний Prisma + PGlite з міграціями). */
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { getFormAnalytics, getQuestionAnalytics, getResponseById } =
  await import("./analytics.service.js");

const USER = "user-matrix";
const FORM = "form-matrix";
const Q = "q-matrix";

const columns = [
  { id: "agree", text: "Згоден", isDefault: false },
  { id: "neutral", text: "Нейтрально", isDefault: false },
  { id: "disagree", text: "Не згоден", isDefault: false },
];
const rows = [
  { id: "speed", text: "Швидкість" },
  { id: "price", text: "Ціна" },
];

beforeAll(async () => {
  await prisma.user.create({ data: { id: USER, email: "m@b.c", password: "x" } });
  await prisma.form.create({ data: { id: FORM, title: "F", userId: USER, shareId: "share-m" } });
  await prisma.question.create({
    data: {
      id: Q,
      text: "Оцініть",
      type: "MATRIX",
      order: 0,
      formId: FORM,
      options: columns,
      config: { rows },
    },
  });

  const answers: unknown[] = [
    { speed: "agree", price: "disagree" },
    { speed: "agree", price: "neutral" },
    { speed: "disagree" }, // часткова відповідь (необов'язкова матриця)
    { speed: "gone", ghost: "agree", price: "agree" }, // застарілі рядок/колонка ігноруються
    "not-an-object",
  ];

  await prisma.response.createMany({
    data: answers.map((value, i) => ({
      id: `resp-m-${i}`,
      formId: FORM,
      answers: { [Q]: value } as Prisma.InputJsonObject,
      visibleQuestionIds: [Q],
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    })),
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("аналітика MATRIX", () => {
  it("деталі: лічильники по клітинках, лише існуючі рядки й колонки", async () => {
    const detail = await getQuestionAnalytics(FORM, Q, USER);

    if (!("matrix" in detail)) throw new Error("unreachable");

    expect(detail.totalAnswers).toBe(5);
    expect(detail.matrix.columns.map((c) => c.id)).toEqual(["agree", "neutral", "disagree"]);

    const [speed, price] = detail.matrix.rows;

    expect(speed).toMatchObject({ rowId: "speed", text: "Швидкість", answered: 3 });
    // agree x2, neutral x0, disagree x1 ("gone" не існує - не рахується)
    expect(speed.counts).toEqual([2, 0, 1]);
    expect(price).toMatchObject({ rowId: "price", answered: 3 });
    expect(price.counts).toEqual([1, 1, 1]);
  });

  it("огляд форми віддає ту саму матрицю", async () => {
    const overview = await getFormAnalytics(FORM, USER);
    const question = overview.questions.find((x) => x.id === Q)!;

    if (question.type !== "MATRIX") throw new Error("unreachable");

    expect(question.matrix.rows[0].counts).toEqual([2, 0, 1]);
  });

  it("без відповідей усі лічильники нульові", async () => {
    await prisma.form.create({
      data: { id: "form-m-empty", title: "E", userId: USER, shareId: "me" },
    });
    await prisma.question.create({
      data: {
        id: "q-m-empty",
        text: "M",
        type: "MATRIX",
        order: 0,
        formId: "form-m-empty",
        options: columns,
        config: { rows },
      },
    });

    const overview = await getFormAnalytics("form-m-empty", USER);
    const question = overview.questions[0];

    if (question.type !== "MATRIX") throw new Error("unreachable");

    expect(question.matrix.rows.every((r) => r.answered === 0)).toBe(true);
    expect(question.matrix.rows[0].counts).toEqual([0, 0, 0]);
  });

  it("розшифровка відповіді: «Рядок: Колонка» у порядку рядків питання", async () => {
    const detail = await getResponseById(FORM, "resp-m-1", USER);

    expect(detail.answers[0].displayValue).toEqual(["Швидкість: Згоден", "Ціна: Нейтрально"]);
  });

  it("часткова відповідь показує лише заповнені рядки", async () => {
    const detail = await getResponseById(FORM, "resp-m-2", USER);

    expect(detail.answers[0].displayValue).toEqual(["Швидкість: Не згоден"]);
  });
});

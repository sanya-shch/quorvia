import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

// The "Other" option in analytics and in the response breakdown (real Prisma + PGlite).
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { getFormAnalytics, getQuestionAnalytics, getResponseById } = await import(
  "./analytics.service.js"
);

const USER = "user-other";
const FORM = "form-other";
const SINGLE = "q-single";
const MULTI = "q-multi";
const PLAIN = "q-plain";

const options = [
  { id: "a", text: "A", isDefault: false },
  { id: "b", text: "B", isDefault: false },
  { id: "o", text: "Інше", isDefault: false, isOther: true },
];

const answers = (single: string, singleOther?: string, multi?: string[], multiOther?: string) => {
  const result: Record<string, unknown> = { [SINGLE]: single };
  if (singleOther !== undefined) result[`${SINGLE}__other`] = singleOther;
  if (multi) result[MULTI] = multi;
  if (multiOther !== undefined) result[`${MULTI}__other`] = multiOther;
  return result as Prisma.InputJsonObject;
};

beforeAll(async () => {
  await prisma.user.create({ data: { id: USER, email: "o@b.c", password: "x" } });
  await prisma.form.create({ data: { id: FORM, title: "F", userId: USER, shareId: "share-o" } });
  await prisma.question.createMany({
    data: [
      { id: SINGLE, text: "Single", type: "CHOICE_SINGLE", order: 0, formId: FORM, options },
      { id: MULTI, text: "Multi", type: "CHOICE_MULTI", order: 1, formId: FORM, options },
      {
        id: PLAIN,
        text: "Plain",
        type: "CHOICE_SINGLE",
        order: 2,
        formId: FORM,
        options: options.slice(0, 2),
      },
    ],
  });

  const rows: Prisma.InputJsonObject[] = [
    answers("o", "Кава"),
    answers("o", "Кава"),
    answers("o", "Чай"),
    answers("a"),
    answers("o", "Какао", ["a", "o"], "Кава"),
  ];

  await prisma.response.createMany({
    data: rows.map((a, i) => ({
      id: `resp-o-${i}`,
      formId: FORM,
      answers: a,
      visibleQuestionIds: [SINGLE, MULTI, PLAIN],
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    })),
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("аналітика варіанта «Інше»", () => {
  it("деталі: «Інше» рахується як звичайний варіант + власні відповіді за частотою", async () => {
    const detail = await getQuestionAnalytics(FORM, SINGLE, USER);

    if (!("distribution" in detail) || !("otherAnswers" in detail)) throw new Error("unreachable");

    expect(detail.distribution.map((d) => [d.optionId, d.count])).toEqual([
      ["a", 1],
      ["b", 0],
      ["o", 4],
    ]);
    // by frequency; on a tie, in order of appearance (Tea is the 3rd answer, Cocoa the 5th)
    expect(detail.otherAnswers).toEqual([
      { value: "Кава", count: 2 },
      { value: "Чай", count: 1 },
      { value: "Какао", count: 1 },
    ]);
  });

  it("CHOICE_MULTI: окремі тексти «Інше» теж збираються", async () => {
    const detail = await getQuestionAnalytics(FORM, MULTI, USER);

    if (!("otherAnswers" in detail)) throw new Error("unreachable");

    expect(detail.otherAnswers).toEqual([{ value: "Кава", count: 1 }]);
  });

  it("питання без «Інше» не отримує поле otherAnswers", async () => {
    const detail = await getQuestionAnalytics(FORM, PLAIN, USER);

    expect("otherAnswers" in detail).toBe(false);
  });

  it("огляд форми рахує розподіл по варіантах, включно з «Інше»", async () => {
    const overview = await getFormAnalytics(FORM, USER);
    const single = overview.questions.find((q) => q.id === SINGLE)!;

    if (single.type !== "CHOICE_SINGLE") throw new Error("unreachable");

    expect(single.distribution.find((d) => d.optionId === "o")?.count).toBe(4);
  });

  it("розшифровка відповіді показує «Інше: текст»", async () => {
    const detail = await getResponseById(FORM, "resp-o-4", USER);
    const single = detail.answers.find((a) => a.questionId === SINGLE)!;
    const multi = detail.answers.find((a) => a.questionId === MULTI)!;

    expect(single.displayValue).toBe("Інше: Какао");
    expect(multi.displayValue).toEqual(["A", "Інше: Кава"]);
    // the helper key does not show up as a separate answer
    expect(detail.answers.map((a) => a.questionId)).not.toContain(`${SINGLE}__other`);
  });
});

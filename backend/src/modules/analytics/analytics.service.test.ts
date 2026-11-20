import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@quorvia/shared-types";

const { prisma } = await import("../../prisma/prisma.js");
const {
  getFormAnalytics,
  getQuestionAnalytics,
  getResponses,
  getResponseById,
  buildFormPaths,
  getFormPaths,
  buildFormFunnel,
  getFormFunnel,
  getFormSummary,
  getFormJourneys,
} = await import("./analytics.service.js");

vi.mock("../../prisma/prisma.js", () => ({
  prisma: {
    form: { findUnique: vi.fn() },
    response: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    responseAttempt: {
      findMany: vi.fn(),
    },
    responseFile: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

const OWNER_ID = "user-owner";
const OTHER_USER_ID = "user-other";
const FORM_ID = "form-1";

const choiceOptions = [
  { id: "opt-a", text: "Варіант А" },
  { id: "opt-b", text: "Варіант Б" },
];

const questions = [
  { id: "q-text", type: "TEXT", text: "Ім'я", description: null, options: null },
  { id: "q-number", type: "NUMBER", text: "Вік", description: null, options: null },
  { id: "q-bool", type: "BOOLEAN", text: "Згода", description: null, options: null },
  {
    id: "q-single",
    type: "CHOICE_SINGLE",
    text: "Колір",
    description: null,
    options: choiceOptions,
  },
  {
    id: "q-multi",
    type: "CHOICE_MULTI",
    text: "Мови",
    description: null,
    options: choiceOptions,
  },
];

const mockForm = (overrides: Record<string, unknown> = {}) => ({
  id: FORM_ID,
  userId: OWNER_ID,
  questions,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getFormAnalytics", () => {
  it("кидає 404/403 за ownership-перевіркою", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);
    await expect(getFormAnalytics(FORM_ID, OWNER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });

    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    await expect(getFormAnalytics(FORM_ID, OTHER_USER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("TEXT: показує топ-5 найпопулярніших відповідей за спаданням частоти", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[0]] }));
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-text": "Київ" } },
      { answers: { "q-text": "Київ" } },
      { answers: { "q-text": "Львів" } },
    ]);

    const result = await getFormAnalytics(FORM_ID, OWNER_ID);
    const q = result.questions[0] as any;

    expect(result.totalResponses).toBe(3);
    expect(q.preview[0]).toEqual({ value: "Київ", count: 2 });
    expect(q.preview[1]).toEqual({ value: "Львів", count: 1 });
  });

  it("NUMBER: рахує avg/min/max по наявних відповідях", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[1]] }));
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-number": 10 } },
      { answers: { "q-number": 20 } },
      { answers: { "q-number": 30 } },
    ]);

    const result = await getFormAnalytics(FORM_ID, OWNER_ID);
    const q = result.questions[0] as any;

    expect(q.stats).toEqual({ avg: 20, min: 10, max: 30 });
  });

  it("NUMBER: без жодної відповіді дає нульову статистику (не NaN/Infinity)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[1]] }));
    (prisma.response.findMany as any).mockResolvedValue([]);

    const result = await getFormAnalytics(FORM_ID, OWNER_ID);
    const q = result.questions[0] as any;

    expect(q.stats).toEqual({ avg: 0, min: 0, max: 0 });
  });

  it("BOOLEAN: рахує trueCount/falseCount", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[2]] }));
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-bool": true } },
      { answers: { "q-bool": true } },
      { answers: { "q-bool": false } },
    ]);

    const result = await getFormAnalytics(FORM_ID, OWNER_ID);
    const q = result.questions[0] as any;

    expect(q.trueCount).toBe(2);
    expect(q.falseCount).toBe(1);
  });

  it("CHOICE_SINGLE: розподіл по всіх options, включно з нульовими", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[3]] }));
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-single": "opt-a" } },
      { answers: { "q-single": "opt-a" } },
    ]);

    const result = await getFormAnalytics(FORM_ID, OWNER_ID);
    const q = result.questions[0] as any;

    expect(q.distribution).toEqual([
      { optionId: "opt-a", text: "Варіант А", count: 2 },
      { optionId: "opt-b", text: "Варіант Б", count: 0 },
    ]);
  });

  it("CHOICE_MULTI: рахує кожен обраний варіант окремо з масиву", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[4]] }));
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-multi": ["opt-a", "opt-b"] } },
      { answers: { "q-multi": ["opt-a"] } },
    ]);

    const result = await getFormAnalytics(FORM_ID, OWNER_ID);
    const q = result.questions[0] as any;

    expect(q.distribution).toEqual([
      { optionId: "opt-a", text: "Варіант А", count: 2 },
      { optionId: "opt-b", text: "Варіант Б", count: 1 },
    ]);
  });

  it("ігнорує відповіді на видалені/невідомі опції, а не падає", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[3]] }));
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-single": "opt-deleted" } },
    ]);

    const result = await getFormAnalytics(FORM_ID, OWNER_ID);
    const q = result.questions[0] as any;

    expect(q.distribution.every((d: any) => d.count === 0)).toBe(true);
  });
});

describe("getQuestionAnalytics", () => {
  it("кидає 404, якщо питання не знайдено у формі", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());

    await expect(getQuestionAnalytics(FORM_ID, "q-nonexistent", OWNER_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: ErrorCode.ANALYTICS_QUESTION_NOT_FOUND,
    });
  });

  it("TEXT: повертає розподіл значень і сирий список відповідей", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-text": "Київ" } },
      { answers: { "q-text": "Київ" } },
    ]);

    const result = (await getQuestionAnalytics(FORM_ID, "q-text", OWNER_ID)) as any;

    expect(result.totalAnswers).toBe(2);
    expect(result.distribution).toEqual([{ value: "Київ", count: 2 }]);
    expect(result.answers).toEqual(["Київ", "Київ"]);
  });

  it("NUMBER: рахує stats і розподіл за значеннями", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-number": 5 } },
      { answers: { "q-number": 15 } },
    ]);

    const result = (await getQuestionAnalytics(FORM_ID, "q-number", OWNER_ID)) as any;

    expect(result.stats).toEqual({ avg: 10, min: 5, max: 15 });
  });

  it("CHOICE_MULTI: агрегує count по кожному id з усіх масивів", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-multi": ["opt-a", "opt-b"] } },
    ]);

    const result = (await getQuestionAnalytics(FORM_ID, "q-multi", OWNER_ID)) as any;

    expect(result.distribution).toEqual(
      expect.arrayContaining([
        { optionId: "opt-a", text: "Варіант А", count: 1 },
        { optionId: "opt-b", text: "Варіант Б", count: 1 },
      ]),
    );
  });

  it("BOOLEAN: рахує trueCount/falseCount", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-bool": true } },
      { answers: { "q-bool": false } },
      { answers: { "q-bool": false } },
    ]);

    const result = (await getQuestionAnalytics(FORM_ID, "q-bool", OWNER_ID)) as any;

    expect(result.trueCount).toBe(1);
    expect(result.falseCount).toBe(2);
  });
});

describe("getResponses", () => {
  it("кидає 404/403 за ownership", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);
    await expect(getResponses(FORM_ID, OWNER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });

    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    await expect(getResponses(FORM_ID, OTHER_USER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("рахує skip за page/limit і повертає total разом зі сторінкою", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.response.count as any).mockResolvedValue(25);
    (prisma.response.findMany as any).mockResolvedValue([{ id: "r-1" }]);

    const result = await getResponses(FORM_ID, OWNER_ID, 3, 10);

    expect(prisma.response.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
    expect(result).toEqual({ total: 25, page: 3, limit: 10, data: [{ id: "r-1", score: null }] });
  });

  it("використовує дефолтні page=1/limit=10, коли не передано", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.response.count as any).mockResolvedValue(0);
    (prisma.response.findMany as any).mockResolvedValue([]);

    await getResponses(FORM_ID, OWNER_ID);

    expect(prisma.response.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
  });
});

describe("getResponseById", () => {
  it("кидає 404, якщо відповідь не знайдено або належить іншій формі", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.response.findUnique as any).mockResolvedValue(null);

    await expect(getResponseById(FORM_ID, "resp-x", OWNER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });

    (prisma.response.findUnique as any).mockResolvedValue({
      id: "resp-x",
      formId: "other-form",
    });
    await expect(getResponseById(FORM_ID, "resp-x", OWNER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("збагачує CHOICE_SINGLE відповідь текстом опції", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[3]] }));
    (prisma.response.findUnique as any).mockResolvedValue({
      id: "resp-1",
      formId: FORM_ID,
      createdAt: new Date("2026-01-01"),
      answers: { "q-single": "opt-b" },
    });

    const result = await getResponseById(FORM_ID, "resp-1", OWNER_ID);

    expect(result.answers).toEqual([
      expect.objectContaining({
        questionId: "q-single",
        displayValue: "Варіант Б",
        rawValue: "opt-b",
      }),
    ]);
  });

  it("позначає видалену опцію CHOICE_SINGLE окремим текстом замість падіння", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[3]] }));
    (prisma.response.findUnique as any).mockResolvedValue({
      id: "resp-1",
      formId: FORM_ID,
      createdAt: new Date("2026-01-01"),
      answers: { "q-single": "opt-deleted" },
    });

    const result = await getResponseById(FORM_ID, "resp-1", OWNER_ID);

    expect(result.answers[0].displayValue as string).toContain("Опція видалена");
  });

  it('BOOLEAN відображається як "Так"/"Ні"', async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[2]] }));
    (prisma.response.findUnique as any).mockResolvedValue({
      id: "resp-1",
      formId: FORM_ID,
      createdAt: new Date("2026-01-01"),
      answers: { "q-bool": true },
    });

    const result = await getResponseById(FORM_ID, "resp-1", OWNER_ID);

    expect(result.answers[0].displayValue).toBe("Так");
  });

  it("пропускає питання без відповіді (null/undefined), не додаючи їх у результат", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(
      mockForm({ questions: [questions[0], questions[2]] }),
    );
    (prisma.response.findUnique as any).mockResolvedValue({
      id: "resp-1",
      formId: FORM_ID,
      createdAt: new Date("2026-01-01"),
      answers: { "q-bool": true },
    });

    const result = await getResponseById(FORM_ID, "resp-1", OWNER_ID);

    expect(result.answers).toHaveLength(1);
    expect(result.answers[0].questionId).toBe("q-bool");
  });
});

describe("getFormAnalytics — visibility stats (conditional logic)", () => {
  it("shownCount/hiddenCount рахуються по visibleQuestionIds відповіді", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[0]] }));
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-text": "Київ" }, visibleQuestionIds: ["q-text"] },
      { answers: { "q-text": "Львів" }, visibleQuestionIds: ["q-text"] },
      { answers: {}, visibleQuestionIds: [] }, // q-text is hidden by a condition for this respondent
    ]);

    const result = await getFormAnalytics(FORM_ID, OWNER_ID);
    const q = result.questions[0] as any;

    expect(q.shownCount).toBe(2);
    expect(q.hiddenCount).toBe(1);
    expect(q.skippedCount).toBe(0); // both who saw it answered
  });

  it("skippedCount: показане, але не обов'язкове і не заповнене питання", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[0]] }));
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-text": "Київ" }, visibleQuestionIds: ["q-text"] },
      { answers: {}, visibleQuestionIds: ["q-text"] }, // saw it but did not answer (optional)
    ]);

    const result = await getFormAnalytics(FORM_ID, OWNER_ID);
    const q = result.questions[0] as any;

    expect(q.shownCount).toBe(2);
    expect(q.hiddenCount).toBe(0);
    expect(q.skippedCount).toBe(1);
  });

  it("legacy-відповіді без visibleQuestionIds: видимість виводиться з наявності ключа в answers", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[0]] }));
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-text": "Київ" } }, // visibleQuestionIds is missing (an old response)
    ]);

    const result = await getFormAnalytics(FORM_ID, OWNER_ID);
    const q = result.questions[0] as any;

    expect(q.shownCount).toBe(1);
    expect(q.hiddenCount).toBe(0);
  });
});

describe("buildFormPaths", () => {
  const orderedQuestions = [
    { id: "q1", text: "Питання 1", order: 0 },
    { id: "q2", text: "Питання 2 (умовне)", order: 1 },
    { id: "q3", text: "Питання 3", order: 2 },
  ];

  it("рахує totalResponses і базові переходи для лінійного (без умов) проходження", () => {
    const responses = [
      { answers: { q1: "a", q2: "b", q3: "c" }, visibleQuestionIds: ["q1", "q2", "q3"] },
      { answers: { q1: "a", q2: "b", q3: "c" }, visibleQuestionIds: ["q1", "q2", "q3"] },
    ];

    const result = buildFormPaths(orderedQuestions, responses);

    expect(result.totalResponses).toBe(2);
    expect(result.nodes).toEqual([
      { questionId: "q1", text: "Питання 1", order: 0, shownCount: 2 },
      { questionId: "q2", text: "Питання 2 (умовне)", order: 1, shownCount: 2 },
      { questionId: "q3", text: "Питання 3", order: 2, shownCount: 2 },
    ]);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        { fromQuestionId: null, toQuestionId: "q1", count: 2 },
        { fromQuestionId: "q1", toQuestionId: "q2", count: 2 },
        { fromQuestionId: "q2", toQuestionId: "q3", count: 2 },
      ]),
    );
  });

  it("пропускає приховане q2 у переході - ребро йде напряму q1 -> q3", () => {
    const responses = [
      { answers: { q1: "a", q3: "c" }, visibleQuestionIds: ["q1", "q3"] }, // q2 is hidden
      { answers: { q1: "a", q2: "b", q3: "c" }, visibleQuestionIds: ["q1", "q2", "q3"] },
    ];

    const result = buildFormPaths(orderedQuestions, responses);

    const q1ToQ3 = result.edges.find((e) => e.fromQuestionId === "q1" && e.toQuestionId === "q3");
    const q1ToQ2 = result.edges.find((e) => e.fromQuestionId === "q1" && e.toQuestionId === "q2");

    expect(q1ToQ3).toEqual({ fromQuestionId: "q1", toQuestionId: "q3", count: 1 });
    expect(q1ToQ2).toEqual({ fromQuestionId: "q1", toQuestionId: "q2", count: 1 });

    const q2Node = result.nodes.find((n) => n.questionId === "q2");
    expect(q2Node?.shownCount).toBe(1);
  });

  it("порожній список відповідей - нулі всюди, без падіння", () => {
    const result = buildFormPaths(orderedQuestions, []);

    expect(result.totalResponses).toBe(0);
    expect(result.edges).toEqual([]);
    expect(result.nodes.every((n) => n.shownCount === 0)).toBe(true);
  });
});

describe("getFormPaths", () => {
  it("кидає 404/403 за ownership-перевіркою, як і інші analytics-ендпоінти", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);
    await expect(getFormPaths(FORM_ID, OWNER_ID)).rejects.toMatchObject({ statusCode: 404 });

    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    await expect(getFormPaths(FORM_ID, OTHER_USER_ID)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("сортує questions за order перед побудовою шляхів", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(
      mockForm({
        questions: [
          { id: "q-b", order: 1, text: "Друге" },
          { id: "q-a", order: 0, text: "Перше" },
        ],
      }),
    );
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-a": "x", "q-b": "y" }, visibleQuestionIds: ["q-a", "q-b"] },
    ]);

    const result = await getFormPaths(FORM_ID, OWNER_ID);

    expect(result.nodes.map((n) => n.questionId)).toEqual(["q-a", "q-b"]);
  });
});

describe("buildFormFunnel", () => {
  const orderedQuestions = [
    { id: "q1", text: "Питання 1", order: 0 },
    { id: "q2", text: "Питання 2", order: 1 },
    { id: "q3", text: "Питання 3", order: 2 },
  ];

  it("рахує reachedCount на основі visibleQuestionIds, а не answers - незавершені attempts теж рахуються", () => {
    const attempts = [
      // finished everything
      { visibleQuestionIds: ["q1", "q2", "q3"], completedAt: new Date() },
      // abandoned after q1 (autosave recorded only q1 as visible)
      { visibleQuestionIds: ["q1"], completedAt: null },
      // abandoned after q2
      { visibleQuestionIds: ["q1", "q2"], completedAt: null },
    ];

    const result = buildFormFunnel(orderedQuestions, attempts);

    expect(result.totalAttempts).toBe(3);
    expect(result.totalCompletions).toBe(1);
    expect(result.nodes).toEqual([
      { questionId: "q1", text: "Питання 1", order: 0, reachedCount: 3, exitedCount: 1 }, // all three reached it, one left here
      { questionId: "q2", text: "Питання 2", order: 1, reachedCount: 2, exitedCount: 1 }, // two, one left here
      { questionId: "q3", text: "Питання 3", order: 2, reachedCount: 1, exitedCount: 0 }, // only the completed one
    ]);
  });

  it("reachedQuestionIds має пріоритет над visibleQuestionIds", () => {
    // Linear form: every question is "visible" from the first autosave, but the respondent only
    // reached q1; reached is what shows the real drop-off.
    const attempts = [
      { reachedQuestionIds: ["q1"], visibleQuestionIds: ["q1", "q2", "q3"], completedAt: null },
      {
        reachedQuestionIds: ["q1", "q2"],
        visibleQuestionIds: ["q1", "q2", "q3"],
        completedAt: null,
      },
    ];

    const result = buildFormFunnel(orderedQuestions, attempts);

    expect(result.nodes.map((n) => n.reachedCount)).toEqual([2, 1, 0]);
  });

  it("питання, приховане пізнішою зміною відповіді, лишається в funnel (visible його вже втратило)", () => {
    const attempts = [
      // Q2 was seen, then Q1 changed -> Q2 is no longer visible, but reached keeps it
      { reachedQuestionIds: ["q1", "q2"], visibleQuestionIds: ["q1"], completedAt: null },
    ];

    const result = buildFormFunnel(orderedQuestions, attempts);

    expect(result.nodes.find((n) => n.questionId === "q2")?.reachedCount).toBe(1);
  });

  it("fallback на visibleQuestionIds для рядків без reachedQuestionIds (до міграції)", () => {
    const attempts = [
      { reachedQuestionIds: null, visibleQuestionIds: ["q1", "q2"], completedAt: null },
    ];

    const result = buildFormFunnel(orderedQuestions, attempts);

    expect(result.nodes.map((n) => n.reachedCount)).toEqual([1, 1, 0]);
  });

  it("completionRate = totalCompletions / totalAttempts", () => {
    const attempts = [
      { visibleQuestionIds: ["q1"], completedAt: new Date() },
      { visibleQuestionIds: ["q1"], completedAt: new Date() },
      { visibleQuestionIds: ["q1"], completedAt: null },
      { visibleQuestionIds: ["q1"], completedAt: null },
    ];

    const result = buildFormFunnel(orderedQuestions, attempts);

    expect(result.completionRate).toBe(0.5);
  });

  it("порожній список attempts - нулі всюди, completionRate 0 (не NaN), без падіння", () => {
    const result = buildFormFunnel(orderedQuestions, []);

    expect(result.totalAttempts).toBe(0);
    expect(result.totalCompletions).toBe(0);
    expect(result.completionRate).toBe(0);
    expect(result.nodes.every((n) => n.reachedCount === 0)).toBe(true);
  });

  it("некоректний (не-масив) visibleQuestionIds трактується як порожній, без падіння", () => {
    const attempts = [{ visibleQuestionIds: null, completedAt: null }];

    const result = buildFormFunnel(orderedQuestions, attempts);

    expect(result.totalAttempts).toBe(1);
    expect(result.nodes.every((n) => n.reachedCount === 0)).toBe(true);
  });
});

describe("getFormFunnel", () => {
  it("кидає 404/403 за ownership-перевіркою, як і інші analytics-ендпоінти", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);
    await expect(getFormFunnel(FORM_ID, OWNER_ID)).rejects.toMatchObject({ statusCode: 404 });

    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    await expect(getFormFunnel(FORM_ID, OTHER_USER_ID)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("читає з responseAttempt, НЕ з response - це і є вся суть 'справжнього' funnel", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(
      mockForm({ questions: [{ id: "q1", order: 0, text: "Q1" }] }),
    );
    (prisma.responseAttempt.findMany as any).mockResolvedValue([
      { visibleQuestionIds: ["q1"], completedAt: null },
    ]);

    const result = await getFormFunnel(FORM_ID, OWNER_ID);

    expect(prisma.responseAttempt.findMany).toHaveBeenCalledWith({
      where: { formId: FORM_ID },
      select: {
        id: true,
        reachedQuestionIds: true,
        visibleQuestionIds: true,
        startedAt: true,
        completedAt: true,
      },
      orderBy: [{ sessionKey: "asc" }, { id: "asc" }],
      take: 2000,
    });
    expect(result.totalAttempts).toBe(1);
    expect(result.totalCompletions).toBe(0);
  });
});

describe("періоди й підсумки", () => {
  const form = {
    id: FORM_ID,
    userId: OWNER_ID,
    questions: questions.map((q, order) => ({ ...q, order })),
  };
  const at = (iso: string) => new Date(iso);

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.form.findUnique as any).mockResolvedValue(form);
  });

  it("getFormFunnel обмежує спроби періодом за startedAt", async () => {
    (prisma.responseAttempt.findMany as any).mockResolvedValue([]);
    const period = { from: at("2026-11-01T00:00:00Z"), to: at("2026-11-30T23:59:59Z") };

    await getFormFunnel(FORM_ID, OWNER_ID, period);

    expect((prisma.responseAttempt.findMany as any).mock.calls[0][0].where).toEqual({
      formId: FORM_ID,
      startedAt: { gte: period.from, lte: period.to },
    });
  });

  it("без періоду where лишається {formId} - запит такий самий, як до появи періодів", async () => {
    (prisma.responseAttempt.findMany as any).mockResolvedValue([]);

    await getFormFunnel(FORM_ID, OWNER_ID);

    expect((prisma.responseAttempt.findMany as any).mock.calls[0][0].where).toEqual({
      formId: FORM_ID,
    });
  });

  it("медіана часу заповнення та виходи по питаннях у воронці", async () => {
    (prisma.responseAttempt.findMany as any).mockResolvedValue([
      {
        id: "a1",
        reachedQuestionIds: [questions[0].id],
        visibleQuestionIds: [],
        startedAt: at("2026-11-01T10:00:00Z"),
        completedAt: at("2026-11-01T10:01:00Z"), // 60 s
      },
      {
        id: "a2",
        reachedQuestionIds: [questions[0].id],
        visibleQuestionIds: [],
        startedAt: at("2026-11-01T11:00:00Z"),
        completedAt: at("2026-11-01T11:03:00Z"), // 180 s
      },
      {
        id: "a3",
        reachedQuestionIds: [questions[0].id],
        visibleQuestionIds: [],
        startedAt: at("2026-11-01T12:00:00Z"),
        completedAt: null,
      },
    ]);

    const funnel = await getFormFunnel(FORM_ID, OWNER_ID);

    expect(funnel.medianCompletionSeconds).toBe(120);
    expect(funnel.nodes.find((n) => n.questionId === questions[0].id)).toMatchObject({
      reachedCount: 3,
      exitedCount: 1,
    });
  });

  it("getFormSummary: KPI періоду, порівняння з попереднім і денна серія", async () => {
    const period = { from: at("2026-11-04T00:00:00Z"), to: at("2026-11-06T23:59:59.999Z") }; // 3 days
    (prisma.responseAttempt.findMany as any)
      // current period
      .mockResolvedValueOnce([
        {
          id: "a1",
          reachedQuestionIds: [],
          visibleQuestionIds: [],
          startedAt: at("2026-11-04T09:00:00Z"),
          completedAt: at("2026-11-04T09:02:00Z"),
        },
        {
          id: "a2",
          reachedQuestionIds: [],
          visibleQuestionIds: [],
          startedAt: at("2026-11-05T09:00:00Z"),
          completedAt: null,
        },
      ])
      // previous period
      .mockResolvedValueOnce([
        {
          id: "b1",
          reachedQuestionIds: [],
          visibleQuestionIds: [],
          startedAt: at("2026-11-02T09:00:00Z"),
          completedAt: null,
        },
      ]);
    (prisma.response.count as any).mockResolvedValueOnce(5).mockResolvedValueOnce(2);

    const summary = await getFormSummary(FORM_ID, OWNER_ID, period);

    expect(summary.current).toEqual({
      responses: 5,
      started: 2,
      completed: 1,
      abandoned: 1,
      completionRate: 0.5,
      medianCompletionSeconds: 120,
    });
    expect(summary.previous).toMatchObject({ responses: 2, started: 1, completed: 0 });
    expect(summary.daily).toEqual([
      { date: "2026-11-04", started: 1, submitted: 1 },
      { date: "2026-11-05", started: 1, submitted: 0 },
      { date: "2026-11-06", started: 0, submitted: 0 },
    ]);
  });

  it("getFormSummary без періоду: порівняння й денної серії немає", async () => {
    (prisma.responseAttempt.findMany as any).mockResolvedValue([]);
    (prisma.response.count as any).mockResolvedValue(0);

    const summary = await getFormSummary(FORM_ID, OWNER_ID);

    expect(summary.previous).toBeNull();
    expect(summary.daily).toEqual([]);
    expect(summary.current.completionRate).toBe(0);
    expect(summary.current.medianCompletionSeconds).toBeNull();
  });

  it("getFormSummary і getFormJourneys: чужа форма - 403, відсутня - 404", async () => {
    (prisma.form.findUnique as any).mockResolvedValueOnce({ ...form, userId: OTHER_USER_ID });
    await expect(getFormSummary(FORM_ID, OWNER_ID)).rejects.toMatchObject({ statusCode: 403 });

    (prisma.form.findUnique as any).mockResolvedValueOnce(null);
    await expect(
      getFormJourneys(FORM_ID, OWNER_ID, { status: "all", steps: 6 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("getFormJourneys будує карту зі спроб", async () => {
    (prisma.responseAttempt.findMany as any).mockResolvedValue([
      {
        id: "a1",
        reachedQuestionIds: [questions[0].id],
        visibleQuestionIds: [],
        startedAt: at("2026-11-01T10:00:00Z"),
        completedAt: null,
      },
    ]);

    const journeys = await getFormJourneys(FORM_ID, OWNER_ID, { status: "all", steps: 6 });

    expect(journeys.totalAttempts).toBe(1);
    expect(journeys.nodes.map((n) => n.kind)).toEqual(["start", "question", "exit"]);
  });
});

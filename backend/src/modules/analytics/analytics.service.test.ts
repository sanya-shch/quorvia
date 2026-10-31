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
    expect(result).toEqual({ total: 25, page: 3, limit: 10, data: [{ id: "r-1" }] });
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
      { answers: {}, visibleQuestionIds: [] }, // q-text приховане умовою для цього респондента
    ]);

    const result = await getFormAnalytics(FORM_ID, OWNER_ID);
    const q = result.questions[0] as any;

    expect(q.shownCount).toBe(2);
    expect(q.hiddenCount).toBe(1);
    expect(q.skippedCount).toBe(0); // обидва, хто бачив, відповіли
  });

  it("skippedCount: показане, але не обов'язкове і не заповнене питання", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [questions[0]] }));
    (prisma.response.findMany as any).mockResolvedValue([
      { answers: { "q-text": "Київ" }, visibleQuestionIds: ["q-text"] },
      { answers: {}, visibleQuestionIds: ["q-text"] }, // бачив, але не відповів (необов'язкове)
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
      { answers: { "q-text": "Київ" } }, // visibleQuestionIds відсутній (стара відповідь)
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
      { answers: { q1: "a", q3: "c" }, visibleQuestionIds: ["q1", "q3"] }, // q2 приховане
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
      // завершив усе
      { visibleQuestionIds: ["q1", "q2", "q3"], completedAt: new Date() },
      // покинув після q1 (autosave зафіксував лише q1 як видиме)
      { visibleQuestionIds: ["q1"], completedAt: null },
      // покинув після q2
      { visibleQuestionIds: ["q1", "q2"], completedAt: null },
    ];

    const result = buildFormFunnel(orderedQuestions, attempts);

    expect(result.totalAttempts).toBe(3);
    expect(result.totalCompletions).toBe(1);
    expect(result.nodes).toEqual([
      { questionId: "q1", text: "Питання 1", order: 0, reachedCount: 3 }, // усі троє дійшли
      { questionId: "q2", text: "Питання 2", order: 1, reachedCount: 2 }, // двоє
      { questionId: "q3", text: "Питання 3", order: 2, reachedCount: 1 }, // лише завершений
    ]);
  });

  it("reachedQuestionIds має пріоритет над visibleQuestionIds", () => {
    // Лінійна форма: усі питання "видимі" з першого autosave, але респондент
    // дійшов лише до q1 - саме reached показує справжній відвал.
    const attempts = [
      { reachedQuestionIds: ["q1"], visibleQuestionIds: ["q1", "q2", "q3"], completedAt: null },
      { reachedQuestionIds: ["q1", "q2"], visibleQuestionIds: ["q1", "q2", "q3"], completedAt: null },
    ];

    const result = buildFormFunnel(orderedQuestions, attempts);

    expect(result.nodes.map((n) => n.reachedCount)).toEqual([2, 1, 0]);
  });

  it("питання, приховане пізнішою зміною відповіді, лишається в funnel (visible його вже втратило)", () => {
    const attempts = [
      // Q2 бачили, потім змінили Q1 -> Q2 більше не видиме, але reached його тримає
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
      select: { id: true, reachedQuestionIds: true, visibleQuestionIds: true, completedAt: true },
      orderBy: [{ sessionKey: "asc" }, { id: "asc" }],
      take: 2000,
    });
    expect(result.totalAttempts).toBe(1);
    expect(result.totalCompletions).toBe(0);
  });
});

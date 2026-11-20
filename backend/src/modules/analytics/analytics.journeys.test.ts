import { describe, expect, it } from "vitest";
import { buildFormJourneys } from "./analytics.journeys.js";

const questions = [
  { id: "q1", text: "Q1", order: 0 },
  { id: "q2", text: "Q2", order: 1 },
  { id: "q3", text: "Q3", order: 2 },
  { id: "q4", text: "Q4", order: 3 },
];

const done = new Date("2026-11-01");
const attempt = (reached: string[], completed = false) => ({
  reachedQuestionIds: reached,
  visibleQuestionIds: [],
  completedAt: completed ? done : null,
});
const opts = { status: "all" as const, steps: 6 };

const node = (result: ReturnType<typeof buildFormJourneys>, id: string) =>
  result.nodes.find((n) => n.id === id);
const link = (result: ReturnType<typeof buildFormJourneys>, source: string, target: string) =>
  result.links.find((l) => l.source === source && l.target === target)?.count;

describe("buildFormJourneys", () => {
  it("лінійна форма: старт -> кроки -> виходи й відправлення, лічильники сходяться", () => {
    const result = buildFormJourneys(
      questions.slice(0, 3),
      [
        attempt(["q1", "q2", "q3"], true),
        attempt(["q1", "q2", "q3"], true),
        attempt(["q1", "q2"]),
        attempt(["q1"]),
      ],
      opts,
    );

    expect(result.totalAttempts).toBe(4);
    expect(node(result, "start")!.count).toBe(4);
    expect(node(result, "q1:q1")!.count).toBe(4);
    expect(node(result, "q2:q2")!.count).toBe(3);
    expect(node(result, "q3:q3")!.count).toBe(2);
    expect(node(result, "submitted")!.count).toBe(2);
    expect(node(result, "exit:q1:q1")).toMatchObject({ kind: "exit", questionId: "q1", count: 1 });
    expect(node(result, "exit:q2:q2")!.count).toBe(1);
    expect(link(result, "q1:q1", "q2:q2")).toBe(3);
    expect(link(result, "q3:q3", "submitted")).toBe(2);
  });

  it("кожен вузол (крім старту) отримує рівно стільки, скільки в нього заходить, і стільки ж виходить далі", () => {
    const result = buildFormJourneys(
      questions,
      [attempt(["q1", "q2", "q4"], true), attempt(["q1", "q3"]), attempt(["q1", "q2"])],
      opts,
    );

    for (const n of result.nodes) {
      const inbound = result.links
        .filter((l) => l.target === n.id)
        .reduce((s, l) => s + l.count, 0);
      const outbound = result.links
        .filter((l) => l.source === n.id)
        .reduce((s, l) => s + l.count, 0);

      if (n.kind !== "start") expect(inbound).toBe(n.count);
      if (n.kind !== "submitted" && n.kind !== "exit") expect(outbound).toBe(n.count);
    }
  });

  it("гілка: різні питання на одному кроці - різні вузли однієї колонки", () => {
    // q2 is skipped by a condition for some respondents: they go q1 -> q3 (step 2).
    const result = buildFormJourneys(
      questions.slice(0, 3),
      [attempt(["q1", "q2", "q3"], true), attempt(["q1", "q3"], true)],
      opts,
    );

    const column2 = result.nodes.filter((n) => n.column === 2 && n.kind === "question");
    expect(column2.map((n) => n.id).sort()).toEqual(["q2:q2", "q2:q3"]);
  });

  it("status=completed / abandoned відфільтровує спроби", () => {
    const attempts = [attempt(["q1", "q2"], true), attempt(["q1"])];

    expect(
      buildFormJourneys(questions, attempts, { ...opts, status: "completed" }).totalAttempts,
    ).toBe(1);

    const abandoned = buildFormJourneys(questions, attempts, { ...opts, status: "abandoned" });
    expect(abandoned.totalAttempts).toBe(1);
    expect(node(abandoned, "submitted")).toBeUndefined();
  });

  it("довший за steps шлях згортається у вузол 'more', а вихід після нього - exit:more", () => {
    const result = buildFormJourneys(
      questions,
      [attempt(["q1", "q2", "q3", "q4"]), attempt(["q1", "q2", "q3", "q4"], true), attempt(["q1"])],
      { status: "all", steps: 2 },
    );

    expect(node(result, "q3:q3")).toBeUndefined();
    expect(node(result, "more")).toMatchObject({ kind: "more", column: 3, count: 2 });
    expect(node(result, "exit:more")!.count).toBe(1);
    expect(node(result, "submitted")!.column).toBe(result.columns - 1);
  });

  it("спроба без жодного питання виходить зі старту, а не губиться", () => {
    const result = buildFormJourneys(questions, [attempt([])], opts);

    expect(node(result, "exit:start")).toMatchObject({ kind: "exit", questionId: null, count: 1 });
  });

  it("для старих рядків без reachedQuestionIds береться visibleQuestionIds", () => {
    const result = buildFormJourneys(
      questions,
      [{ visibleQuestionIds: ["q1", "q2"], completedAt: null }],
      opts,
    );

    expect(node(result, "q2:q2")!.count).toBe(1);
  });

  it("невідомі id (питання видалили) ігноруються", () => {
    const result = buildFormJourneys(questions, [attempt(["ghost", "q1"], true)], opts);

    expect(result.nodes.map((n) => n.id)).toEqual(["start", "q1:q1", "submitted"]);
  });

  it("колонка 'submitted' - остання; вузли впорядковані за колонкою і порядком питань", () => {
    const result = buildFormJourneys(
      questions,
      [attempt(["q1", "q2"], true), attempt(["q1"])],
      opts,
    );

    const columns = result.nodes.map((n) => n.column);
    expect([...columns].sort((a, b) => a - b)).toEqual(columns);
    expect(node(result, "submitted")!.column).toBe(result.columns - 1);
  });
});

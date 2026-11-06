import { describe, it, expect } from "vitest";
import { sortByOrder, getNextQuestion } from "./questionFlow";
import type { Question } from "../../types/formBuilder";

const q = (overrides: Partial<Question>): Question => ({
  id: "q",
  type: "TEXT",
  text: "",
  required: false,
  order: 0,
  options: [],
  config: null,
  ...overrides,
});

describe("sortByOrder", () => {
  it("сортує за order, не мутує вхідний масив", () => {
    const input = [q({ id: "b", order: 2 }), q({ id: "a", order: 0 }), q({ id: "c", order: 1 })];
    const sorted = sortByOrder(input);
    expect(sorted.map((x) => x.id)).toEqual(["a", "c", "b"]);
    expect(input.map((x) => x.id)).toEqual(["b", "a", "c"]); // the original is unchanged
  });
});

describe("getNextQuestion — інтеграція з @quorvia/condition-engine", () => {
  it("без умов повертає перше питання, що йде після afterOrder", () => {
    const questions = [q({ id: "q1", order: 0 }), q({ id: "q2", order: 1 })];
    expect(getNextQuestion(questions, {}, -Infinity)?.id).toBe("q1");
    expect(getNextQuestion(questions, {}, 0)?.id).toBe("q2");
  });

  it("повертає null, коли досяжних питань більше немає", () => {
    const questions = [q({ id: "q1", order: 0 })];
    expect(getNextQuestion(questions, {}, 0)).toBeNull();
  });

  it("пропускає питання, чия умова не виконана - branching реально працює", () => {
    const questions = [
      q({ id: "q1", order: 0 }),
      q({
        id: "q2-conditional",
        order: 1,
        condition: {
          logic: "AND",
          rules: [{ questionId: "q1", operator: "equals", value: "yes" }],
        },
      }),
      q({ id: "q3", order: 2 }),
    ];

    // q1 != "yes" -> q2-conditional is hidden, the next one after q1 is q3 right away
    const next = getNextQuestion(questions, { q1: "no" }, 0);
    expect(next?.id).toBe("q3");
  });

  it("показує умовне питання, коли його умова виконана", () => {
    const questions = [
      q({ id: "q1", order: 0 }),
      q({
        id: "q2-conditional",
        order: 1,
        condition: {
          logic: "AND",
          rules: [{ questionId: "q1", operator: "equals", value: "yes" }],
        },
      }),
      q({ id: "q3", order: 2 }),
    ];

    const next = getNextQuestion(questions, { q1: "yes" }, 0);
    expect(next?.id).toBe("q2-conditional");
  });

  it("пропускає кілька послідовних прихованих питань підряд (skip chain)", () => {
    const hiddenCondition = {
      logic: "AND" as const,
      rules: [{ questionId: "q1", operator: "equals" as const, value: "trigger" }],
    };
    const questions = [
      q({ id: "q1", order: 0 }),
      q({ id: "q2", order: 1, condition: hiddenCondition }),
      q({ id: "q3", order: 2, condition: hiddenCondition }),
      q({ id: "q4", order: 3 }),
    ];

    // q1 != "trigger" -> both q2 and q3 are hidden, we go straight to q4
    const next = getNextQuestion(questions, { q1: "no" }, 0);
    expect(next?.id).toBe("q4");
  });

  it("переоцінює гілку динамічно при зміні відповіді (сценарій 'повернувся й змінив відповідь')", () => {
    const questions = [
      q({ id: "q1", order: 0 }),
      q({
        id: "q2",
        order: 1,
        condition: {
          logic: "AND",
          rules: [{ questionId: "q1", operator: "equals", value: "yes" }],
        },
      }),
    ];

    expect(getNextQuestion(questions, { q1: "yes" }, 0)?.id).toBe("q2");
    expect(getNextQuestion(questions, { q1: "no" }, 0)).toBeNull();
  });
});

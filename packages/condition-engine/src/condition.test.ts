import { describe, expect, it } from "vitest";
import {
  evaluateCondition,
  resolveVisibleQuestionIds,
  validateConditionGraph,
  type QuestionLike,
} from "./condition.js";

describe("evaluateCondition", () => {
  it("повертає true, якщо умови нема", () => {
    expect(evaluateCondition(undefined, {})).toBe(true);
    expect(evaluateCondition(null, {})).toBe(true);
  });

  it("equals: показує питання, якщо відповідь збігається", () => {
    const condition = {
      logic: "AND" as const,
      rules: [{ questionId: "q1", operator: "equals" as const, value: "yes" }],
    };
    expect(evaluateCondition(condition, { q1: "yes" })).toBe(true);
    expect(evaluateCondition(condition, { q1: "no" })).toBe(false);
    expect(evaluateCondition(condition, {})).toBe(false);
  });

  it("notEquals", () => {
    const condition = {
      logic: "AND" as const,
      rules: [{ questionId: "q1", operator: "notEquals" as const, value: "no" }],
    };
    expect(evaluateCondition(condition, { q1: "yes" })).toBe(true);
    expect(evaluateCondition(condition, { q1: "no" })).toBe(false);
  });

  it("gt / lt: числові порівняння", () => {
    const gt = {
      logic: "AND" as const,
      rules: [{ questionId: "q1", operator: "gt" as const, value: 18 }],
    };
    expect(evaluateCondition(gt, { q1: 25 })).toBe(true);
    expect(evaluateCondition(gt, { q1: 10 })).toBe(false);
    expect(evaluateCondition(gt, { q1: "25" })).toBe(false); // a non-number never matches

    const lt = {
      logic: "AND" as const,
      rules: [{ questionId: "q1", operator: "lt" as const, value: 100 }],
    };
    expect(evaluateCondition(lt, { q1: 50 })).toBe(true);
  });

  it("contains: працює і для масиву (CHOICE_MULTI), і для рядка", () => {
    const condition = {
      logic: "AND" as const,
      rules: [{ questionId: "q1", operator: "contains" as const, value: "pizza" }],
    };
    expect(evaluateCondition(condition, { q1: ["pizza", "sushi"] })).toBe(true);
    expect(evaluateCondition(condition, { q1: ["sushi"] })).toBe(false);
    expect(evaluateCondition(condition, { q1: "I love pizza" })).toBe(true);
  });

  it("in: перевіряє, чи значення відповіді входить у переданий список", () => {
    const condition = {
      logic: "AND" as const,
      rules: [{ questionId: "q1", operator: "in" as const, value: ["UA", "PL", "DE"] }],
    };
    expect(evaluateCondition(condition, { q1: "UA" })).toBe(true);
    expect(evaluateCondition(condition, { q1: "US" })).toBe(false);
  });

  it("AND: усі правила мають бути true", () => {
    const condition = {
      logic: "AND" as const,
      rules: [
        { questionId: "q1", operator: "equals" as const, value: "yes" },
        { questionId: "q2", operator: "gt" as const, value: 18 },
      ],
    };
    expect(evaluateCondition(condition, { q1: "yes", q2: 20 })).toBe(true);
    expect(evaluateCondition(condition, { q1: "yes", q2: 10 })).toBe(false);
  });

  it("OR: достатньо одного правила true", () => {
    const condition = {
      logic: "OR" as const,
      rules: [
        { questionId: "q1", operator: "equals" as const, value: "yes" },
        { questionId: "q2", operator: "equals" as const, value: "maybe" },
      ],
    };
    expect(evaluateCondition(condition, { q1: "no", q2: "maybe" })).toBe(true);
    expect(evaluateCondition(condition, { q1: "no", q2: "no" })).toBe(false);
  });
});

describe("resolveVisibleQuestionIds", () => {
  it("повертає тільки ті питання, чиї умови виконались", () => {
    const questions: QuestionLike[] = [
      { id: "q1" },
      {
        id: "q2",
        condition: {
          logic: "AND",
          rules: [{ questionId: "q1", operator: "equals", value: "yes" }],
        },
      },
      {
        id: "q3",
        condition: { logic: "AND", rules: [{ questionId: "q1", operator: "equals", value: "no" }] },
      },
    ];
    const visible = resolveVisibleQuestionIds(questions, { q1: "yes" });
    expect(visible.has("q1")).toBe(true);
    expect(visible.has("q2")).toBe(true);
    expect(visible.has("q3")).toBe(false);
  });
});

describe("validateConditionGraph", () => {
  const q = (id: string, order: number, condition?: any): QuestionLike & { order: number } => ({
    id,
    order,
    condition,
  });

  it("валідний граф без умов проходить без помилок", () => {
    const result = validateConditionGraph([q("q1", 0), q("q2", 1)]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("валідна залежність на попереднє питання проходить", () => {
    const result = validateConditionGraph([
      q("q1", 0),
      q("q2", 1, { logic: "AND", rules: [{ questionId: "q1", operator: "equals", value: "yes" }] }),
    ]);
    expect(result.valid).toBe(true);
  });

  it("виявляє самопосилання", () => {
    const result = validateConditionGraph([
      q("q1", 0, { logic: "AND", rules: [{ questionId: "q1", operator: "equals", value: "yes" }] }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].reason).toBe("SELF_REFERENCE");
  });

  it("виявляє посилання на неіснуюче питання", () => {
    const result = validateConditionGraph([
      q("q1", 0, {
        logic: "AND",
        rules: [{ questionId: "ghost", operator: "equals", value: "yes" }],
      }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].reason).toBe("UNKNOWN_QUESTION");
  });

  it("виявляє forward-reference (залежність від питання, що йде пізніше)", () => {
    const result = validateConditionGraph([
      q("q1", 0, { logic: "AND", rules: [{ questionId: "q2", operator: "equals", value: "yes" }] }),
      q("q2", 1),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].reason).toBe("FORWARD_REFERENCE");
  });

  it("виявляє прямий цикл (Q1 -> Q2 -> Q1)", () => {
    // same order on purpose, so the forward-reference check does not mask the CYCLE case
    const result = validateConditionGraph([
      q("q1", 0, { logic: "AND", rules: [{ questionId: "q2", operator: "equals", value: "yes" }] }),
      q("q2", 0, { logic: "AND", rules: [{ questionId: "q1", operator: "equals", value: "yes" }] }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.reason === "CYCLE")).toBe(true);
  });

  it("виявляє довший цикл (Q1 -> Q2 -> Q3 -> Q1)", () => {
    const result = validateConditionGraph([
      q("q1", 0, { logic: "AND", rules: [{ questionId: "q3", operator: "equals", value: "yes" }] }),
      q("q2", 0, { logic: "AND", rules: [{ questionId: "q1", operator: "equals", value: "yes" }] }),
      q("q3", 0, { logic: "AND", rules: [{ questionId: "q2", operator: "equals", value: "yes" }] }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.filter((e) => e.reason === "CYCLE").length).toBeGreaterThanOrEqual(1);
  });
});

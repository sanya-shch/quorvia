/**
 * Conditional logic for questions.
 *
 * A question may have a `condition`: a rule that decides whether it is shown,
 * based on the answers to earlier questions. The module deliberately does not
 * depend on Express/Prisma/React/Vue. These are pure functions shared by the
 * backend (validation on save, server-side visibility recalculation on submit)
 * and by every frontend (step-by-step mode).
 */

import type {
  ConditionGroup,
  ConditionOperator,
  ConditionRule,
  ConditionValue,
} from "@quorvia/shared-types";

export type { ConditionGroup, ConditionOperator, ConditionRule, ConditionValue };

// Answers collected so far: questionId -> value.
export type AnswersMap = Record<string, unknown>;

export interface QuestionLike {
  id: string;
  condition?: ConditionGroup | null;
}

const toComparable = (value: unknown): string | number | boolean | undefined => {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return undefined;
};

const evaluateRule = (rule: ConditionRule, answers: AnswersMap): boolean => {
  const actual = answers[rule.questionId];

  switch (rule.operator) {
    case "equals":
      return toComparable(actual) === rule.value;

    case "notEquals":
      return toComparable(actual) !== rule.value;

    case "gt": {
      const a = toComparable(actual);
      return typeof a === "number" && typeof rule.value === "number" && a > rule.value;
    }

    case "lt": {
      const a = toComparable(actual);
      return typeof a === "number" && typeof rule.value === "number" && a < rule.value;
    }

    case "contains": {
      // actual is an array (CHOICE_MULTI) or a string; rule.value is what we look for inside it
      if (Array.isArray(actual)) {
        return actual.includes(rule.value as string);
      }
      if (typeof actual === "string" && typeof rule.value === "string") {
        return actual.includes(rule.value);
      }
      return false;
    }

    case "in": {
      // rule.value is a list of accepted values, actual is a single value
      const a = toComparable(actual);
      return Array.isArray(rule.value) && a !== undefined && rule.value.includes(a as string);
    }

    default:
      return false;
  }
};

// A question without a `condition` is always visible.
export const evaluateCondition = (
  condition: ConditionGroup | null | undefined,
  answers: AnswersMap,
): boolean => {
  if (!condition || condition.rules.length === 0) return true;

  return condition.logic === "AND"
    ? condition.rules.every((rule) => evaluateRule(rule, answers))
    : condition.rules.some((rule) => evaluateRule(rule, answers));
};

/**
 * Returns the questions that were actually eligible to be shown for the given
 * answers. The backend uses it to recalculate on submit instead of trusting the
 * client, and analytics uses it to tell "hidden by a condition" from "shown but
 * skipped".
 */
export const resolveVisibleQuestionIds = (
  questions: QuestionLike[],
  answers: AnswersMap,
): Set<string> => {
  const visible = new Set<string>();
  for (const q of questions) {
    if (evaluateCondition(q.condition, answers)) {
      visible.add(q.id);
    }
  }
  return visible;
};

export interface ConditionGraphError {
  questionId: string;
  reason: "SELF_REFERENCE" | "UNKNOWN_QUESTION" | "CYCLE" | "FORWARD_REFERENCE";
  detail: string;
}

export interface ConditionGraphValidationResult {
  valid: boolean;
  errors: ConditionGraphError[];
}

/**
 * Validates the dependency graph of `condition.rules[].questionId` for a whole form:
 *  - references to a nonexistent questionId,
 *  - self-references (Q1 depends on Q1),
 *  - cycles (Q1 -> Q2 -> Q1), found by DFS that tracks the current path,
 *  - forward references: a question cannot depend on one that comes after it by
 *    `order` (unreachable in step-by-step mode: that answer does not exist yet).
 *
 * The backend calls it on create/update and is the source of truth; the builder
 * validation only duplicates it for instant feedback.
 */
export const validateConditionGraph = (
  questions: (QuestionLike & { order: number })[],
): ConditionGraphValidationResult => {
  const errors: ConditionGraphError[] = [];
  const byId = new Map(questions.map((q) => [q.id, q]));

  // forward-reference / unknown / self-reference are checked independently of cycles
  for (const q of questions) {
    if (!q.condition) continue;

    for (const rule of q.condition.rules) {
      if (rule.questionId === q.id) {
        errors.push({
          questionId: q.id,
          reason: "SELF_REFERENCE",
          detail: `Питання ${q.id} не може залежати саме від себе`,
        });
        continue;
      }

      const target = byId.get(rule.questionId);
      if (!target) {
        errors.push({
          questionId: q.id,
          reason: "UNKNOWN_QUESTION",
          detail: `Питання ${q.id} посилається на неіснуюче questionId: ${rule.questionId}`,
        });
        continue;
      }

      if (target.order >= q.order) {
        errors.push({
          questionId: q.id,
          reason: "FORWARD_REFERENCE",
          detail: `Питання ${q.id} (order ${q.order}) не може залежати від питання ${target.id}, яке йде не раніше нього (order ${target.order})`,
        });
      }
    }
  }

  // Cycles: DFS with three states (white/gray/black) over valid edges only
  // (unknown questionIds were reported above and are not added to the graph)
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const state = new Map<string, number>(questions.map((q) => [q.id, WHITE]));
  const cycleQuestionIds = new Set<string>();

  const dependencies = (id: string): string[] => {
    const q = byId.get(id);
    if (!q?.condition) return [];
    return q.condition.rules
      .map((r) => r.questionId)
      .filter((depId) => byId.has(depId) && depId !== id);
  };

  const dfs = (id: string): boolean => {
    state.set(id, GRAY);
    for (const depId of dependencies(id)) {
      const depState = state.get(depId);
      if (depState === GRAY) {
        cycleQuestionIds.add(id);
        cycleQuestionIds.add(depId);
        return true;
      }
      if (depState === WHITE && dfs(depId)) {
        cycleQuestionIds.add(id);
        return true;
      }
    }
    state.set(id, BLACK);
    return false;
  };

  for (const q of questions) {
    if (state.get(q.id) === WHITE) {
      dfs(q.id);
    }
  }

  for (const id of cycleQuestionIds) {
    errors.push({
      questionId: id,
      reason: "CYCLE",
      detail: `Питання ${id} є частиною циклічної залежності умов`,
    });
  }

  return { valid: errors.length === 0, errors };
};

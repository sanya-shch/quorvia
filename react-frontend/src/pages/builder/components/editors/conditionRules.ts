import type { ConditionOperator, ConditionRule, Question } from "../../../../types/formBuilder";

// Operators that make sense for the answer of each question type.
export const OPERATORS_BY_TYPE: Record<Question["type"], ConditionOperator[]> = {
  TEXT: ["equals", "notEquals", "contains"],
  NUMBER: ["equals", "notEquals", "gt", "lt"],
  // gt/lt only for the number type: an ISO date string would not pass such a comparison.
  DATE: ["equals", "notEquals"],
  BOOLEAN: ["equals"],
  RATING: ["equals", "notEquals", "gt", "lt"],
  SCALE: ["equals", "notEquals", "gt", "lt"],
  NPS: ["equals", "notEquals", "gt", "lt"],
  // Ranking is not supported in conditions (see questionTypeSupportsConditions).
  RANKING: [],
  MATRIX: [],
  // Files cannot be compared with a value.
  FILE: [],
  CHOICE_SINGLE: ["equals", "notEquals", "in"],
  // The answer is an option id, exactly like a single choice.
  IMAGE_CHOICE: ["equals", "notEquals", "in"],
  CHOICE_MULTI: ["contains"],
};

// A new rule on `target`: its first operator and no value yet.
export const newConditionRule = (target: Question & { id: string }): ConditionRule => ({
  questionId: target.id,
  operator: OPERATORS_BY_TYPE[target.type][0],
  value: "",
});

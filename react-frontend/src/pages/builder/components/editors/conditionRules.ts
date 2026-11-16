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
  // A computed value: not in a question's own condition (the server refuses it).
  CALCULATION: [],
};

// The kind of answer a question gives to a condition. A calculation gives what its result type is.
export const conditionKind = (question: Pick<Question, "type" | "config">): Question["type"] => {
  if (question.type !== "CALCULATION") return question.type;

  if (question.config?.resultType === "string") return "TEXT";
  if (question.config?.resultType === "boolean") return "BOOLEAN";

  return "NUMBER";
};

export const operatorsFor = (question: Pick<Question, "type" | "config">): ConditionOperator[] =>
  OPERATORS_BY_TYPE[conditionKind(question)];

// A new rule on `target`: its first operator and no value yet.
export const newConditionRule = (target: Question & { id: string }): ConditionRule => ({
  questionId: target.id,
  operator: operatorsFor(target)[0]!,
  value: "",
});

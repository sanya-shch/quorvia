import { evaluateCondition } from "@quorvia/condition-engine";
import {
  questionTypeSupportsConditions,
  type ConditionGroup,
  type QuestionType,
} from "@quorvia/shared-types";

// Conditions that are not a question's own (end rules, quotas) look at the answers the server
// accepted. They share these two rules, so an end rule and a quota agree on what an answer "is".

// Does the respondent's answer set satisfy the condition? A rule on a question that was not shown to
// the respondent does not hold, whatever the operator: without this, "not equals" would be true for
// a hidden question (there is no answer to be equal to).
export const conditionHolds = (
  condition: ConditionGroup,
  answers: Record<string, unknown>,
  visibleQuestionIds: ReadonlySet<string>,
): boolean => {
  const holds = (rule: ConditionGroup["rules"][number]): boolean =>
    visibleQuestionIds.has(rule.questionId) &&
    evaluateCondition({ logic: "AND", rules: [rule] }, answers);

  return condition.logic === "AND" ? condition.rules.every(holds) : condition.rules.some(holds);
};

// Why a condition cannot be saved. A stable code: the frontend builds its message from it.
export type ConditionIssueReason = "UNKNOWN_QUESTION" | "UNSUPPORTED_QUESTION_TYPE";

export interface ConditionIssue {
  questionId: string;
  reason: ConditionIssueReason;
}

// Every question a condition looks at must exist in the form being saved and must be a type whose
// answer conditions can compare. Question types are only known here, which is why the shape-only
// normalizers in shared-types do not check it.
export const findConditionIssues = (
  condition: ConditionGroup,
  questions: readonly { id: string; type: QuestionType }[],
  // Keys that are not questions but may be looked at (the score of an end rule).
  allowedKeys: ReadonlySet<string> = new Set(),
): ConditionIssue[] => {
  const typeById = new Map(questions.map((q) => [q.id, q.type]));
  const issues: ConditionIssue[] = [];

  for (const { questionId } of condition.rules) {
    if (allowedKeys.has(questionId)) continue;

    const type = typeById.get(questionId);

    if (!type) {
      issues.push({ questionId, reason: "UNKNOWN_QUESTION" });
    } else if (!questionTypeSupportsConditions(type)) {
      issues.push({ questionId, reason: "UNSUPPORTED_QUESTION_TYPE" });
    }
  }

  return issues;
};

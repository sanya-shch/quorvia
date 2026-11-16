import {
  END_RULE_LIMITS,
  SCORE_CONDITION_KEYS,
  normalizeEndRules,
  questionTypeSupportsConditions,
  questionTypeSupportsEndRuleConditions,
  type ConditionGroup,
  type ConditionRule,
  type FormEndRule,
} from "@quorvia/shared-types";
import type { Question } from "../../types/formBuilder";
import { newConditionRule } from "./components/editors/conditionRules";

// Everything about conditional end screens ("result rules") in the builder: pure functions, no
// React. The server decides which rule applies (see resolveEndScreen in the backend); the builder
// only edits the rules and keeps what it sends valid.

// The questions a rule can look at: saved ones (they have an id) whose answer can be compared.
export const conditionTargets = (questions: readonly Question[]): Question[] =>
  questions.filter((q) => q.id && questionTypeSupportsConditions(q.type));

// The same for a result rule, which may also look at a calculation field (it runs after them).
export const endRuleTargets = (questions: readonly Question[]): Question[] =>
  questions.filter((q) => q.id && questionTypeSupportsEndRuleConditions(q.type));

export const canAddEndRule = (
  rules: readonly FormEndRule[] | null | undefined,
  questions: readonly Question[],
): boolean => (rules?.length ?? 0) < END_RULE_LIMITS.rules && endRuleTargets(questions).length > 0;

// A new, still empty rule on the first usable question; null when there is none.
export const createEndRule = (questions: readonly Question[]): FormEndRule | null => {
  const target = endRuleTargets(questions)[0];

  if (!target) return null;

  return {
    id: crypto.randomUUID(),
    condition: { logic: "AND", rules: [newConditionRule(target as Question & { id: string })] },
    screen: { text: "", redirectUrl: "" },
  };
};

export const isConditionValueFilled = (value: ConditionRule["value"]): boolean => {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return value.trim() !== "";

  return Array.isArray(value) && value.length > 0;
};

export const conditionHasEmptyValue = (condition: ConditionGroup): boolean =>
  condition.rules.some((r) => !isConditionValueFilled(r.value));

export const hasEmptyConditionValue = (rule: FormEndRule): boolean =>
  conditionHasEmptyValue(rule.condition);

// A rule the author has not finished (no message, or a condition without a value) is not saved,
// like an unfinished welcome or end screen; the editor warns about it while typing.
export const isEndRuleComplete = (rule: FormEndRule): boolean =>
  rule.screen.text.trim() !== "" && !hasEmptyConditionValue(rule);

// Indexes of the rules that look at a question that no longer exists (it was deleted) or cannot be
// used in conditions. The server refuses such rules, so saving is blocked until they are fixed.
export const findBrokenEndRules = (
  rules: readonly FormEndRule[] | null | undefined,
  questions: readonly Question[],
  // A rule may look at the score ($score, $percent) while the form scores its responses.
  scoringEnabled = false,
): number[] => {
  const usable = new Set<string | undefined>(endRuleTargets(questions).map((q) => q.id));

  if (scoringEnabled) SCORE_CONDITION_KEYS.forEach((key) => usable.add(key));

  return (rules ?? []).flatMap((rule, index) =>
    rule.condition.rules.some((r) => !usable.has(r.questionId)) ? [index] : [],
  );
};

// What is sent on save: the finished rules, in order; null when there are none (removes them).
export const prepareEndRules = (
  rules: readonly FormEndRule[] | null | undefined,
): FormEndRule[] | null => normalizeEndRules((rules ?? []).filter(isEndRuleComplete));

export const moveEndRule = (
  rules: readonly FormEndRule[],
  from: number,
  to: number,
): FormEndRule[] => {
  if (from === to || from < 0 || to < 0 || from >= rules.length || to >= rules.length) {
    return [...rules];
  }

  const next = [...rules];
  const [moved] = next.splice(from, 1);

  next.splice(to, 0, moved);

  return next;
};

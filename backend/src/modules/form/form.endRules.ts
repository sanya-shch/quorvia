import { evaluateCondition } from "@quorvia/condition-engine";
import {
  ErrorCode,
  localizeEndRuleScreen,
  normalizeEndRules,
  normalizeEndScreen,
  questionTypeSupportsConditions,
  type ConditionGroup,
  type FormEndRule,
  type FormEndScreen,
  type FormTranslations,
  type QuestionType,
} from "@quorvia/shared-types";
import { AppError } from "../../shared/middleware/errorHandler.js";

// Why a rule cannot be saved. A stable code: the frontend builds its message from it.
export type EndRuleIssueReason = "UNKNOWN_QUESTION" | "UNSUPPORTED_QUESTION_TYPE";

export interface EndRuleIssue {
  ruleId: string;
  questionId: string;
  reason: EndRuleIssueReason;
}

// Every question a rule looks at must exist in the form being saved and must be a type whose answer
// conditions can compare. Question types are only known here, which is why the shape-only
// normalizeEndRules does not check it.
export const findEndRuleIssues = (
  rules: readonly FormEndRule[] | null,
  questions: readonly { id: string; type: QuestionType }[],
): EndRuleIssue[] => {
  const typeById = new Map(questions.map((q) => [q.id, q.type]));
  const issues: EndRuleIssue[] = [];

  for (const rule of rules ?? []) {
    for (const { questionId } of rule.condition.rules) {
      const type = typeById.get(questionId);

      if (!type) {
        issues.push({ ruleId: rule.id, questionId, reason: "UNKNOWN_QUESTION" });
      } else if (!questionTypeSupportsConditions(type)) {
        issues.push({ ruleId: rule.id, questionId, reason: "UNSUPPORTED_QUESTION_TYPE" });
      }
    }
  }

  return issues;
};

// Also what stops a question from being deleted while a rule still points at it: the rules are
// checked against the question list the form is saved with.
export const assertEndRulesValid = (
  rules: readonly FormEndRule[] | null,
  questions: readonly { id: string; type: QuestionType }[],
): void => {
  const issues = findEndRuleIssues(rules, questions);

  if (issues.length > 0) {
    throw new AppError(ErrorCode.FORM_INVALID_END_RULES, 400, issues);
  }
};

// A rule on a question that was not shown to the respondent does not hold. Without this, "not equals"
// would be true for a hidden question (there is no answer to be equal to).
const groupHolds = (
  condition: ConditionGroup,
  answers: Record<string, unknown>,
  visibleQuestionIds: ReadonlySet<string>,
): boolean => {
  const holds = (rule: ConditionGroup["rules"][number]): boolean =>
    visibleQuestionIds.has(rule.questionId) &&
    evaluateCondition({ logic: "AND", rules: [rule] }, answers);

  return condition.logic === "AND" ? condition.rules.every(holds) : condition.rules.some(holds);
};

export interface ResolvedEndScreen {
  // The rule that decided the screen; null when none matched (the form's own screen, or nothing).
  endRuleId: string | null;
  // In the respondent's language. null: the viewer shows its built-in thank-you message.
  screen: FormEndScreen | null;
}

// The form's own end screen in the respondent's language (the main language needs no translation).
const localizeDefaultScreen = (
  screen: FormEndScreen,
  translations: unknown,
  language: string | null,
): FormEndScreen => {
  const text = language ? (translations as FormTranslations | null)?.[language]?.endText : null;

  return typeof text === "string" && text.trim() !== "" ? { ...screen, text } : screen;
};

// Decides the end screen on the server, from the answers the server itself accepted. The first
// rule that holds wins; otherwise the form's own screen applies.
export const resolveEndScreen = (
  form: { endRules?: unknown; endScreen?: unknown; translations?: unknown },
  answers: Record<string, unknown>,
  visibleQuestionIds: ReadonlySet<string>,
  language: string | null,
): ResolvedEndScreen => {
  for (const rule of normalizeEndRules(form.endRules) ?? []) {
    if (groupHolds(rule.condition, answers, visibleQuestionIds)) {
      return {
        endRuleId: rule.id,
        screen: localizeEndRuleScreen(rule, form.translations, language),
      };
    }
  }

  const screen = normalizeEndScreen(form.endScreen);

  return {
    endRuleId: null,
    screen: screen ? localizeDefaultScreen(screen, form.translations, language) : null,
  };
};

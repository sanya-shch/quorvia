import {
  ErrorCode,
  localizeEndRuleScreen,
  normalizeEndRules,
  normalizeEndScreen,
  type FormEndRule,
  type FormEndScreen,
  type FormTranslations,
  type QuestionType,
} from "@quorvia/shared-types";
import { AppError } from "../../shared/middleware/errorHandler.js";
import {
  conditionHolds,
  findConditionIssues,
  type ConditionIssueReason,
} from "./form.conditionMatch.js";

// Why a rule cannot be saved (see findConditionIssues).
export type EndRuleIssueReason = ConditionIssueReason;

export interface EndRuleIssue {
  ruleId: string;
  questionId: string;
  reason: EndRuleIssueReason;
}

export const findEndRuleIssues = (
  rules: readonly FormEndRule[] | null,
  questions: readonly { id: string; type: QuestionType }[],
): EndRuleIssue[] =>
  (rules ?? []).flatMap((rule) =>
    findConditionIssues(rule.condition, questions).map((issue) => ({ ruleId: rule.id, ...issue })),
  );

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
    if (conditionHolds(rule.condition, answers, visibleQuestionIds)) {
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

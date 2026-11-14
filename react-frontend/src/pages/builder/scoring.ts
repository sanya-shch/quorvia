import {
  SCORE_LIMITS,
  isScoreBound,
  isScoreValue,
  normalizeScoring,
  type FormScoring,
} from "@quorvia/shared-types";
import type {
  Question,
  QuestionOption,
  ScoringDraft,
  ScoringDraftCategory,
} from "../../types/formBuilder";

// Scoring in the builder, apart from React. The settings are edited as a draft (the bounds of a
// category are typed as text) and become FormScoring only on save; the points of answers live in
// the questions themselves (option.score, config.score, config.scoreMultiplier).

export const draftFromScoring = (scoring: FormScoring | null): ScoringDraft | null =>
  scoring
    ? {
        enabled: scoring.enabled,
        categories: scoring.categories.map((c) => ({
          id: c.id,
          label: c.label,
          min: String(c.min),
          max: String(c.max),
        })),
      }
    : null;

// The number a field holds, or null when it is empty or not a number (no partial typing like "-").
export const parseNumber = (text: string): number | null => {
  const trimmed = text.trim();

  if (trimmed === "") return null;

  const value = Number(trimmed.replace(",", "."));

  return Number.isFinite(value) ? value : null;
};

// A category with a label and both bounds as valid numbers. Others are not saved (the editor warns).
const completeCategory = (
  category: ScoringDraftCategory,
): { id: string; label: string; min: number; max: number } | null => {
  const min = parseNumber(category.min);
  const max = parseNumber(category.max);

  if (category.label.trim() === "" || min === null || max === null) return null;
  if (!isScoreBound(min) || !isScoreBound(max)) return null;

  return { id: category.id, label: category.label.trim(), min, max };
};

export type CategoryIssue = "incomplete" | "inverted" | "overlap";

// What is wrong with each category (by index). "incomplete" categories are only not saved; "inverted"
// (min above max) and "overlap" (shares totals with an earlier one) are refused by the server, so
// they block saving.
export const findCategoryIssues = (
  draft: ScoringDraft | null | undefined,
): Record<number, CategoryIssue> => {
  const issues: Record<number, CategoryIssue> = {};
  const accepted: { min: number; max: number }[] = [];

  (draft?.categories ?? []).forEach((category, index) => {
    const complete = completeCategory(category);

    if (!complete) {
      issues[index] = "incomplete";
    } else if (complete.min > complete.max) {
      issues[index] = "inverted";
    } else if (accepted.some((a) => complete.min <= a.max && complete.max >= a.min)) {
      issues[index] = "overlap";
    } else {
      accepted.push(complete);
    }
  });

  return issues;
};

export const hasBlockingCategoryIssue = (draft: ScoringDraft | null | undefined): boolean =>
  Object.values(findCategoryIssues(draft)).some((issue) => issue !== "incomplete");

// What is sent on save: the categories that are fine, in order; null when there is nothing to keep
// (scoring off and no categories), which removes the settings.
export const prepareScoring = (draft: ScoringDraft | null | undefined): FormScoring | null => {
  if (!draft) return null;

  const issues = findCategoryIssues(draft);

  return normalizeScoring({
    enabled: draft.enabled,
    categories: draft.categories.flatMap((category, index) => {
      const complete = issues[index] === undefined ? completeCategory(category) : null;

      return complete ? [complete] : [];
    }),
  });
};

export const newCategoryId = (): string => crypto.randomUUID();

export const canAddCategory = (draft: ScoringDraft | null | undefined): boolean =>
  (draft?.categories.length ?? 0) < SCORE_LIMITS.categories;

// ---- the points of answers

// The points a text field holds: a number within the limits with at most 2 decimals, or null for
// an empty field. `undefined` for text that is not usable (the field is marked invalid).
export const parseScoreValue = (text: string): number | null | undefined => {
  if (text.trim() === "") return null;

  const value = parseNumber(text);

  return value !== null && isScoreValue(value) ? value : undefined;
};

export const scoreToText = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

// Questions whose answers can give points, and how.
export const isScorableType = (type: Question["type"]): boolean =>
  type === "CHOICE_SINGLE" ||
  type === "CHOICE_MULTI" ||
  type === "IMAGE_CHOICE" ||
  type === "BOOLEAN" ||
  type === "NUMBER" ||
  type === "RATING" ||
  type === "SCALE" ||
  type === "NPS";

export const withOptionScore = (
  options: readonly QuestionOption[],
  optionId: string,
  score: number | null,
): QuestionOption[] =>
  options.map((option) => {
    if (option.id !== optionId) return option;

    const next = { ...option };

    delete next.score;

    return score === null ? next : { ...next, score };
  });

// A NUMBER with a multiplier needs a range: without it the best possible score is unknown.
export const numberNeedsRange = (question: Pick<Question, "type" | "config">): boolean =>
  question.type === "NUMBER" &&
  Boolean(question.config?.scoreMultiplier) &&
  !(
    typeof question.config?.min === "number" &&
    typeof question.config?.max === "number" &&
    question.config.min <= question.config.max
  );

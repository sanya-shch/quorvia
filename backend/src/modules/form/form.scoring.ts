import { computeScore, type ScorableQuestion, type ScoreResult } from "@quorvia/calculation-engine";
import {
  localizeScoreCategoryLabel,
  normalizeScoring,
  type FormScoring,
  type QuestionConfig,
  type QuestionType,
} from "@quorvia/shared-types";

// The respondent's side of scoring. The points of each answer, the thresholds and the categories are
// the owner's: they stay on the server, and the respondent only gets the end screen it produced.

interface StoredQuestion {
  id: string;
  type: QuestionType;
  required?: boolean | null;
  options?: unknown;
  config?: unknown;
}

// A stored question as the engine wants it. The options and the config are Json: the engine copes
// with whatever shape they have, so nothing is trusted beyond the type.
export const toScorable = (question: StoredQuestion): ScorableQuestion => ({
  id: question.id,
  type: question.type,
  required: question.required ?? false,
  options: Array.isArray(question.options)
    ? (question.options as { id: string; score?: number | null }[])
    : null,
  config:
    question.config && typeof question.config === "object" && !Array.isArray(question.config)
      ? (question.config as QuestionConfig)
      : null,
});

export interface ScoredSubmission extends ScoreResult {
  scoring: FormScoring;
}

// The score of a submission, or null when the form does not score. Only the visible questions count,
// exactly like the answers that were stored.
export const scoreSubmission = (
  form: { scoring?: unknown; questions: readonly StoredQuestion[] },
  answers: Record<string, unknown>,
  visibleQuestionIds: ReadonlySet<string>,
): ScoredSubmission | null => {
  const scoring = normalizeScoring(form.scoring);

  if (!scoring?.enabled) return null;

  return {
    ...computeScore(form.questions.map(toScorable), answers, visibleQuestionIds, scoring),
    scoring,
  };
};

// What an end rule's condition sees besides the answers: `$score` and `$percent` (a percentage is
// only there when the maximum is positive, so a rule on it simply does not hold otherwise).
export const scoreConditionAnswers = (scored: ScoredSubmission): Record<string, number> => ({
  $score: scored.score,
  ...(scored.percent === null ? {} : { $percent: scored.percent }),
});

// A number as the respondent reads it: in their language, at most 2 decimals, no grouping.
const formatNumber = (value: number, language: string | null): string => {
  try {
    return new Intl.NumberFormat(language ?? "en", {
      maximumFractionDigits: 2,
      useGrouping: false,
    }).format(value);
  } catch {
    return String(value);
  }
};

const PLACEHOLDER = /\{\{\s*(score|maxScore|percent|category)\s*\}\}/g;

/**
 * Puts the respondent's result into the text of an end screen: `{{score}}`, `{{maxScore}}`,
 * `{{percent}}` (the number only: write the % sign yourself) and `{{category}}`.
 *
 * It is plain text replacement on the server, so the respondent never receives the raw numbers or
 * the list of categories, only the sentence the author wrote. A placeholder with nothing to show
 * (no percentage when the maximum is 0, no category when the total falls in none) becomes empty.
 */
export const fillScorePlaceholders = (
  text: string,
  scored: ScoredSubmission,
  translations: unknown,
  language: string | null,
  // How numbers are written. The respondent's language, or else the form's main one (a respondent
  // who sent no language still reads the form's own language).
  numberLocale: string | null = language,
): string => {
  const category = scored.scoring.categories.find((c) => c.id === scored.categoryId);
  const values: Record<string, string> = {
    score: formatNumber(scored.score, numberLocale),
    maxScore: formatNumber(scored.maxScore, numberLocale),
    percent: scored.percent === null ? "" : formatNumber(scored.percent, numberLocale),
    category: category ? localizeScoreCategoryLabel(category, translations, language) : "",
  };

  return text.replace(PLACEHOLDER, (_match, key: string) => values[key] ?? "");
};

// The question the respondent was never shown cannot have been answered, but a stored question may
// still carry points: none of them reach a respondent. Used for the public form.
export const stripQuestionScoring = <T extends { options?: unknown; config?: unknown }>(
  question: T,
): T => {
  const { options, config } = question;
  const result: T = { ...question };

  if (Array.isArray(options)) {
    result.options = options.map((option) => {
      if (!option || typeof option !== "object") return option;

      const { score: _score, ...rest } = option as Record<string, unknown>;

      return rest;
    }) as T["options"];
  }

  if (config && typeof config === "object" && !Array.isArray(config)) {
    const {
      score: _score,
      scoreMultiplier: _multiplier,
      ...rest
    } = config as Record<string, unknown>;

    result.config = rest as T["config"];
  }

  return result;
};

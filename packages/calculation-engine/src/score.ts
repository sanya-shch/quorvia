import {
  getScaleBounds,
  isChoiceQuestionType,
  type FormScoring,
  type QuestionConfig,
  type QuestionType,
  type ScaleQuestionType,
} from "@quorvia/shared-types";

// What the engine needs to know about a question. The server passes its stored questions, the
// builder and the viewer pass theirs: the same function gives the same score everywhere.
export interface ScorableQuestion {
  id: string;
  type: QuestionType;
  required?: boolean;
  options?: readonly { id: string; score?: number | null }[] | null;
  config?: QuestionConfig | null;
}

export interface ScoreResult {
  // The respondent's total, at most 2 decimals.
  score: number;
  // The best total they could have got on the questions they were shown.
  maxScore: number;
  // score / maxScore in percent, 2 decimals; null when there is no positive maximum.
  percent: number | null;
  // The category the total falls into; null when scoring has no categories or none matches.
  categoryId: string | null;
}

// Everything is computed in hundredths (integers), so sums are exact: 0.1 + 0.2 is 0.3 here.
const toHundredths = (value: number): number =>
  Math.sign(value) * Math.round(Math.abs(value) * 100);

const pointsOf = (value: number | null | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? toHundredths(value) : 0;

interface Contribution {
  // Hundredths the answer earned.
  points: number;
  // Hundredths of the best answer.
  max: number;
}

const NONE: Contribution = { points: 0, max: 0 };

// The best a question can give. A question that may be skipped is worth at least 0 (skipping it);
// a required one must be answered, so even a negative best answer is its maximum.
const bestOf = (candidates: readonly number[], required: boolean | undefined): number => {
  const best = candidates.length > 0 ? Math.max(...candidates) : 0;

  return required ? best : Math.max(0, best);
};

const optionScores = (question: ScorableQuestion): Map<string, number> =>
  new Map((question.options ?? []).map((option) => [option.id, pointsOf(option.score)]));

const scoreChoice = (question: ScorableQuestion, answer: unknown): Contribution => {
  const scores = optionScores(question);

  if (question.type === "CHOICE_MULTI") {
    const picked = Array.isArray(answer) ? new Set(answer) : new Set<unknown>();
    const points = [...scores].reduce((sum, [id, value]) => sum + (picked.has(id) ? value : 0), 0);
    const positives = [...scores.values()].filter((value) => value > 0);

    // Picking every option that gives points is the best answer; when none does, a required
    // question still needs one option, so its least bad one.
    const max =
      positives.length > 0 || !question.required
        ? positives.reduce((sum, value) => sum + value, 0)
        : bestOf([...scores.values()], true);

    return { points, max };
  }

  const picked = typeof answer === "string" ? (scores.get(answer) ?? 0) : 0;

  return { points: picked, max: bestOf([...scores.values()], question.required) };
};

const scoreBoolean = (question: ScorableQuestion, answer: unknown): Contribution => {
  const yes = pointsOf(question.config?.score?.true);
  const no = pointsOf(question.config?.score?.false);

  return {
    points: answer === true ? yes : answer === false ? no : 0,
    max: bestOf([yes, no], question.required),
  };
};

// The answer times the factor, rounded to hundredths (half away from zero).
const scoreTimes = (
  question: ScorableQuestion,
  answer: unknown,
  bounds: { min: number; max: number } | null,
): Contribution => {
  const factor = pointsOf(question.config?.scoreMultiplier);

  if (factor === 0) return NONE;

  const value = typeof answer === "number" && Number.isFinite(answer) ? answer : null;
  const points =
    value === null ? 0 : Math.sign(value * factor) * Math.round(Math.abs(value * factor));

  // Without known bounds the best answer is unknown and the question adds nothing to the maximum.
  const max = bounds ? bestOf([bounds.min * factor, bounds.max * factor], question.required) : 0;

  return { points, max };
};

const finiteBounds = (config: QuestionConfig | null | undefined) =>
  typeof config?.min === "number" &&
  Number.isFinite(config.min) &&
  typeof config.max === "number" &&
  Number.isFinite(config.max) &&
  config.min <= config.max
    ? { min: config.min, max: config.max }
    : null;

const contribution = (question: ScorableQuestion, answer: unknown): Contribution => {
  if (isChoiceQuestionType(question.type)) return scoreChoice(question, answer);

  switch (question.type) {
    case "BOOLEAN":
      return scoreBoolean(question, answer);
    case "NUMBER":
      return scoreTimes(question, answer, finiteBounds(question.config));
    case "RATING":
    case "SCALE":
    case "NPS":
      return scoreTimes(
        question,
        answer,
        getScaleBounds(question.type as ScaleQuestionType, question.config),
      );
    default:
      // TEXT, DATE, RANKING, MATRIX, FILE: no points.
      return NONE;
  }
};

const round2 = (value: number): number =>
  Math.sign(value) * (Math.round(Math.abs(value) * 100) / 100);

/**
 * The category a total falls into: the first whose range contains it (both ends included). null
 * without scoring, with scoring switched off, or when no range matches.
 */
export const categoryFor = (
  scoring: FormScoring | null | undefined,
  score: number,
): string | null => {
  if (!scoring?.enabled) return null;

  return scoring.categories.find((c) => score >= c.min && score <= c.max)?.id ?? null;
};

/**
 * The respondent's score. Only questions the respondent was shown count (`visibleQuestionIds`;
 * null or undefined means all), both in the total and in the maximum, so a form with branches does
 * not penalize someone for questions they never saw.
 *
 * Which answers give points: the picked options of choice questions (`option.score`), "yes" / "no"
 * of BOOLEAN (`config.score`), and the number of NUMBER / RATING / SCALE / NPS times
 * `config.scoreMultiplier`. Anything else gives nothing, and so does an answer that is missing or of
 * the wrong shape: the engine never throws on stored data.
 */
export const computeScore = (
  questions: readonly ScorableQuestion[],
  answers: Readonly<Record<string, unknown>>,
  visibleQuestionIds?: ReadonlySet<string> | null,
  scoring?: FormScoring | null,
): ScoreResult => {
  let points = 0;
  let max = 0;

  for (const question of questions) {
    if (visibleQuestionIds && !visibleQuestionIds.has(question.id)) continue;

    const result = contribution(question, answers[question.id]);

    points += result.points;
    max += result.max;
  }

  const score = points / 100;
  const maxScore = max / 100;

  return {
    score,
    maxScore,
    percent: maxScore > 0 ? round2((score / maxScore) * 100) : null,
    categoryId: categoryFor(scoring, score),
  };
};

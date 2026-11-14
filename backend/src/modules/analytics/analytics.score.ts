import { normalizeScoring, type FormScoring } from "@quorvia/shared-types";
import type { ResponseScoreDto, ScoreAnalyticsDto } from "./analytics.types.js";

// Scoring in the owner's analytics. Only what was stored with each response counts: a response is
// never rescored, so these numbers are what the respondents were actually given, whatever the
// points are today.

export interface ScoredRow {
  score: number | null;
  maxScore: number | null;
  scoreCategoryId: string | null;
}

const HISTOGRAM_BUCKETS = 10;

const round2 = (value: number): number => Math.round(value * 100) / 100;

// Fed one response at a time (like the other accumulators), so a form with a million responses is
// never held in memory. The histogram is by percent of the maximum: the maximum differs between
// respondents (a branch they did not see is not in it), so raw totals would not be comparable.
export const createScoreAccumulator = () => {
  let scored = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let percentSum = 0;
  let percentCount = 0;
  let uncategorized = 0;
  const buckets = new Array<number>(HISTOGRAM_BUCKETS).fill(0);
  const categoryCounts = new Map<string, number>();

  return {
    add(row: ScoredRow) {
      // Not scored: the form did not score when it was answered.
      if (row.score === null || row.score === undefined) return;

      scored += 1;
      sum += row.score;
      min = Math.min(min, row.score);
      max = Math.max(max, row.score);

      if (row.maxScore !== null && row.maxScore !== undefined && row.maxScore > 0) {
        const percent = (row.score / row.maxScore) * 100;

        percentSum += percent;
        percentCount += 1;
        // 0-10, 10-20 ... 90-100: 100 belongs to the last bucket, anything outside is clamped.
        const index = Math.min(
          HISTOGRAM_BUCKETS - 1,
          Math.max(0, Math.floor(percent / (100 / HISTOGRAM_BUCKETS))),
        );

        buckets[index] = (buckets[index] ?? 0) + 1;
      }

      if (row.scoreCategoryId) {
        categoryCounts.set(row.scoreCategoryId, (categoryCounts.get(row.scoreCategoryId) ?? 0) + 1);
      } else {
        uncategorized += 1;
      }
    },

    // null when the form never scored: nothing to show.
    result(storedScoring: unknown): ScoreAnalyticsDto | null {
      const scoring = normalizeScoring(storedScoring);

      if (scored === 0 && !scoring?.enabled) return null;

      const categories = (scoring?.categories ?? []).map((category) => ({
        id: category.id,
        label: category.label,
        min: category.min,
        max: category.max,
        count: categoryCounts.get(category.id) ?? 0,
      }));
      const known = new Set(categories.map((c) => c.id));
      // Responses counted in a category that was deleted later still belong to nobody now.
      const orphaned = [...categoryCounts].reduce(
        (total, [id, count]) => (known.has(id) ? total : total + count),
        0,
      );

      return {
        enabled: scoring?.enabled === true,
        scoredCount: scored,
        average: scored > 0 ? round2(sum / scored) : 0,
        min: scored > 0 ? min : 0,
        max: scored > 0 ? max : 0,
        averagePercent: percentCount > 0 ? round2(percentSum / percentCount) : null,
        histogram: buckets.map((count, index) => ({
          fromPercent: index * (100 / HISTOGRAM_BUCKETS),
          toPercent: (index + 1) * (100 / HISTOGRAM_BUCKETS),
          count,
        })),
        categories,
        uncategorizedCount: uncategorized + orphaned,
      };
    },
  };
};

// The score of one response for the owner: the totals and the category by name. null when the
// response was not scored.
export const toResponseScore = (
  row: ScoredRow,
  storedScoring: unknown,
): ResponseScoreDto | null => {
  if (row.score === null || row.score === undefined) return null;

  const scoring: FormScoring | null = normalizeScoring(storedScoring);
  const category = scoring?.categories.find((c) => c.id === row.scoreCategoryId);
  const maxScore = row.maxScore ?? null;

  return {
    score: row.score,
    maxScore,
    percent: maxScore !== null && maxScore > 0 ? round2((row.score / maxScore) * 100) : null,
    categoryId: row.scoreCategoryId,
    categoryLabel: category?.label ?? null,
  };
};

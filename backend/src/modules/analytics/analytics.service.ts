import { prisma } from "../../prisma/prisma.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import {
  assertNever,
  ErrorCode,
  getOtherOption,
  getScaleBounds,
  isOtherSelected,
  isScaleQuestionType,
  otherAnswerKey,
  type NpsBreakdown,
  type MatrixStats,
  type QuestionConfig,
  type QuestionType,
  type RankingOptionStats,
  type ScaleBounds,
} from "@quorvia/shared-types";
import { Answers } from "../response/response.types.js";
import { paginate } from "../../shared/utils/paginate.js";
import { analyticsConfig } from "./analytics.config.js";
import {
  EnrichedAnswer,
  FormAnalyticsDto,
  FormFunnelDto,
  FormPathsDto,
  QuestionAnalyticsDto,
  QuestionFunnelNode,
  QuestionOverview,
  QuestionPathEdge,
  QuestionPathNode,
  ResponseDetailsDto,
  ResponseListDto,
} from "./analytics.types.js";

/**
 * visibleQuestionIds is persisted only for responses submitted after conditional logic
 * was introduced. For older responses (empty/null Json) we fall back to treating every
 * question that has an answer as visible, which is what analytics did before, so old data
 * is not broken retroactively; it just cannot tell "hidden" from "shown but skipped" exactly.
 */
const resolveVisibleIdsForResponse = (
  response: { answers: unknown; visibleQuestionIds: unknown },
  allQuestionIds: string[],
): Set<string> => {
  if (Array.isArray(response.visibleQuestionIds)) {
    return new Set(response.visibleQuestionIds as string[]);
  }
  const answers = response.answers as Answers;
  return new Set(allQuestionIds.filter((id) => answers?.[id] !== undefined));
};

type StoredOption = { id: string; text: string; isOther?: boolean };

/**
 * Responses in batches (keyset pagination) rather than one findMany over the whole
 * table: the aggregations below are incremental, so memory is bounded by the batch size,
 * not by the number of responses. The (createdAt, id) order is deterministic and served
 * by the (formId, createdAt, id) index.
 */
const responseBatches = (formId: string) =>
  paginate(
    (page) =>
      prisma.response.findMany({
        where: { formId },
        select: { id: true, answers: true, visibleQuestionIds: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        ...page,
      }),
    analyticsConfig.batchSize,
  );

// Same for attempts; the (sessionKey, id) order follows the form's unique index.
const attemptBatches = (formId: string) =>
  paginate(
    (page) =>
      prisma.responseAttempt.findMany({
        where: { formId },
        select: {
          id: true,
          reachedQuestionIds: true,
          visibleQuestionIds: true,
          completedAt: true,
        },
        orderBy: [{ sessionKey: "asc" }, { id: "asc" }],
        ...page,
      }),
    analyticsConfig.batchSize,
  );

// Scale answers: integers within the current scale bounds only. Values outside them
// (config changed after collecting) stay out of the distribution and the average so it
// cannot leave the scale; they still count in totalAnswers.
const isInScale = (value: unknown, bounds: ScaleBounds): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= bounds.min &&
  value <= bounds.max;

const scaleValues = (bounds: ScaleBounds): number[] =>
  Array.from({ length: bounds.max - bounds.min + 1 }, (_, i) => bounds.min + i);

// NPS: 9-10 promoters, 7-8 passives, 0-6 detractors; score = %promoters - %detractors.
const computeNps = (counts: Map<number, number>): NpsBreakdown => {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const [value, count] of counts) {
    if (value >= 9) promoters += count;
    else if (value >= 7) passives += count;
    else detractors += count;
  }

  const total = promoters + passives + detractors;

  return {
    promoters,
    passives,
    detractors,
    score: total === 0 ? null : Math.round(((promoters - detractors) / total) * 1000) / 10,
  };
};

// RANKING: position counters per option. Only full rankings of the current options
// count (a permutation of all ids without duplicates), so changing the options after
// collecting does not skew the average positions (they still count in totalAnswers).
type RankingAccumulator = {
  optionCount: number;
  positions: Map<string, number[]>;
  rankedCount: number;
};

const createRankingAccumulator = (options: StoredOption[]): RankingAccumulator => ({
  optionCount: options.length,
  positions: new Map(options.map((o) => [o.id, new Array<number>(options.length).fill(0)])),
  rankedCount: 0,
});

const recordRanking = (acc: RankingAccumulator, value: unknown): void => {
  if (!Array.isArray(value) || value.length !== acc.optionCount) return;

  const seen = new Set<string>();

  // Validate the whole answer first and count afterwards, so a partly invalid ranking
  // does not leave half of the counters incremented.
  for (const id of value) {
    if (typeof id !== "string" || !acc.positions.has(id) || seen.has(id)) return;
    seen.add(id);
  }

  value.forEach((id: string, index) => {
    acc.positions.get(id)![index] += 1;
  });
  acc.rankedCount += 1;
};

const rankingStats = (options: StoredOption[], acc: RankingAccumulator): RankingOptionStats[] =>
  options.map((option) => {
    const positions = acc.positions.get(option.id)!;
    const weighted = positions.reduce((sum, count, index) => sum + count * (index + 1), 0);

    return {
      optionId: option.id,
      text: option.text,
      avgPosition: acc.rankedCount > 0 ? weighted / acc.rankedCount : null,
      positions,
    };
  });

// MATRIX: "row x column" counters. Cells are independent (an optional matrix may be
// filled partially); only existing rows and columns are counted, so changing them after
// collecting does not break the statistics.
type MatrixAccumulator = {
  rows: { id: string; text: string }[];
  columns: { id: string; text: string }[];
  rowIndex: Map<string, number>;
  columnIndex: Map<string, number>;
  counts: number[][];
};

const createMatrixAccumulator = (
  rows: { id: string; text: string }[],
  columns: StoredOption[],
): MatrixAccumulator => ({
  rows,
  columns: columns.map((c) => ({ id: c.id, text: c.text })),
  rowIndex: new Map(rows.map((r, i) => [r.id, i])),
  columnIndex: new Map(columns.map((c, i) => [c.id, i])),
  counts: rows.map(() => new Array<number>(columns.length).fill(0)),
});

const recordMatrix = (acc: MatrixAccumulator, value: unknown): void => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;

  for (const [rowId, columnId] of Object.entries(value as Record<string, unknown>)) {
    const row = acc.rowIndex.get(rowId);
    const column = typeof columnId === "string" ? acc.columnIndex.get(columnId) : undefined;

    if (row !== undefined && column !== undefined) {
      acc.counts[row][column] += 1;
    }
  }
};

const matrixStats = (acc: MatrixAccumulator): MatrixStats => ({
  columns: acc.columns,
  rows: acc.rows.map((row, i) => ({
    rowId: row.id,
    text: row.text,
    answered: acc.counts[i].reduce((sum, count) => sum + count, 0),
    counts: acc.counts[i],
  })),
});

const matrixRowsOf = (config: unknown): { id: string; text: string }[] =>
  (config as QuestionConfig | null)?.rows ?? [];

type QuestionAccumulator = {
  type: QuestionType;
  matrix?: MatrixAccumulator;
  ranking?: RankingAccumulator;
  scaleBounds?: ScaleBounds;
  scaleCounts?: Map<number, number>;
  shownCount: number;
  answeredCount: number;
  textCounts?: Map<string, number>;
  numberSum: number;
  numberCount: number;
  numberMin?: number;
  numberMax?: number;
  choiceCounts?: Map<string, number>;
  trueCount: number;
  falseCount: number;
};

export const getFormAnalytics = async (
  formId: string,
  userId: string,
): Promise<FormAnalyticsDto> => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { questions: true },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  let totalResponses = 0;

  const allQuestionIds = form.questions.map((q) => q.id);

  const accumulators = new Map<string, QuestionAccumulator>();

  for (const q of form.questions) {
    accumulators.set(q.id, {
      type: q.type,
      shownCount: 0,
      answeredCount: 0,
      textCounts: q.type === "TEXT" || q.type === "DATE" ? new Map() : undefined,
      numberSum: 0,
      numberCount: 0,
      choiceCounts: q.type === "CHOICE_SINGLE" || q.type === "CHOICE_MULTI" ? new Map() : undefined,
      scaleBounds: isScaleQuestionType(q.type)
        ? getScaleBounds(q.type, q.config as QuestionConfig | null)
        : undefined,
      scaleCounts: isScaleQuestionType(q.type) ? new Map() : undefined,
      ranking:
        q.type === "RANKING"
          ? createRankingAccumulator((q.options ?? []) as StoredOption[])
          : undefined,
      matrix:
        q.type === "MATRIX"
          ? createMatrixAccumulator(matrixRowsOf(q.config), (q.options ?? []) as StoredOption[])
          : undefined,
      trueCount: 0,
      falseCount: 0,
    });
  }

  for await (const batch of responseBatches(formId)) {
    for (const response of batch) {
      totalResponses++;
      const visibleIds = resolveVisibleIdsForResponse(response, allQuestionIds);
      const answers = response.answers as Answers;

      for (const qId of visibleIds) {
        const acc = accumulators.get(qId);
        if (!acc) continue; // the question was removed from the form after this response

        acc.shownCount++;

        const value = answers?.[qId];
        if (value === undefined) continue; // shown but skipped (skippedCount)

        acc.answeredCount++;

        if (acc.type === "TEXT" || acc.type === "DATE") {
          const key = value as string;
          // Free text has an unbounded number of distinct values and the Map cannot grow forever
          // (for very large forms the top 5 becomes approximate).
          if (acc.textCounts!.has(key) || acc.textCounts!.size < analyticsConfig.maxTrackedTextValues) {
            acc.textCounts!.set(key, (acc.textCounts!.get(key) || 0) + 1);
          }
        } else if (acc.type === "NUMBER") {
          const n = value as number;
          acc.numberSum += n;
          acc.numberCount += 1;
          acc.numberMin = acc.numberMin === undefined ? n : Math.min(acc.numberMin, n);
          acc.numberMax = acc.numberMax === undefined ? n : Math.max(acc.numberMax, n);
        } else if (acc.type === "CHOICE_SINGLE") {
          if (typeof value === "string") {
            acc.choiceCounts!.set(value, (acc.choiceCounts!.get(value) || 0) + 1);
          }
        } else if (acc.type === "CHOICE_MULTI") {
          if (Array.isArray(value)) {
            for (const v of value) {
              acc.choiceCounts!.set(v, (acc.choiceCounts!.get(v) || 0) + 1);
            }
          }
        } else if (acc.type === "BOOLEAN") {
          if (value === true) acc.trueCount++;
          else if (value === false) acc.falseCount++;
        } else if (acc.type === "RATING" || acc.type === "SCALE" || acc.type === "NPS") {
          if (isInScale(value, acc.scaleBounds!)) {
            acc.scaleCounts!.set(value, (acc.scaleCounts!.get(value) || 0) + 1);
            acc.numberSum += value;
            acc.numberCount += 1;
            acc.numberMin = acc.numberMin === undefined ? value : Math.min(acc.numberMin, value);
            acc.numberMax = acc.numberMax === undefined ? value : Math.max(acc.numberMax, value);
          }
        } else if (acc.type === "RANKING") {
          recordRanking(acc.ranking!, value);
        } else if (acc.type === "MATRIX") {
          recordMatrix(acc.matrix!, value);
        } else {
          assertNever(acc.type, "question type");
        }
      }
    }
  }

  const questions: QuestionOverview[] = [];

  for (const q of form.questions) {
    const acc = accumulators.get(q.id)!;
    const visibility = {
      shownCount: acc.shownCount,
      skippedCount: acc.shownCount - acc.answeredCount,
      hiddenCount: totalResponses - acc.shownCount,
    };

    if (q.type === "TEXT" || q.type === "DATE") {
      const preview = Array.from(acc.textCounts!.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      questions.push({ id: q.id, text: q.text, type: q.type, preview, ...visibility });
    } else if (q.type === "NUMBER") {
      if (acc.numberCount === 0) {
        questions.push({
          id: q.id,
          text: q.text,
          type: "NUMBER",
          stats: { avg: 0, min: 0, max: 0 },
          ...visibility,
        });
        continue;
      }

      questions.push({
        id: q.id,
        text: q.text,
        type: "NUMBER",
        stats: {
          avg: acc.numberSum / acc.numberCount,
          min: acc.numberMin!,
          max: acc.numberMax!,
        },
        ...visibility,
      });
    } else if (q.type === "CHOICE_SINGLE" || q.type === "CHOICE_MULTI") {
      const options = (q.options as { id: string; text: string }[]) ?? [];

      questions.push({
        id: q.id,
        type: q.type,
        text: q.text,
        distribution: options.map((opt) => ({
          optionId: opt.id,
          text: opt.text,
          count: acc.choiceCounts!.get(opt.id) ?? 0,
        })),
        ...visibility,
      });
    } else if (q.type === "BOOLEAN") {
      questions.push({
        id: q.id,
        type: "BOOLEAN",
        text: q.text,
        trueCount: acc.trueCount,
        falseCount: acc.falseCount,
        ...visibility,
      });
    } else if (q.type === "RATING" || q.type === "SCALE" || q.type === "NPS") {
      questions.push({
        id: q.id,
        text: q.text,
        type: q.type,
        stats: {
          avg: acc.numberCount > 0 ? acc.numberSum / acc.numberCount : 0,
          min: acc.numberMin ?? 0,
          max: acc.numberMax ?? 0,
        },
        distribution: scaleValues(acc.scaleBounds!).map((value) => ({
          optionId: String(value),
          text: String(value),
          count: acc.scaleCounts!.get(value) ?? 0,
        })),
        ...(q.type === "NPS" ? { nps: computeNps(acc.scaleCounts!) } : {}),
        ...visibility,
      });
    } else if (q.type === "RANKING") {
      questions.push({
        id: q.id,
        text: q.text,
        type: "RANKING",
        ranking: rankingStats((q.options ?? []) as StoredOption[], acc.ranking!),
        rankedCount: acc.ranking!.rankedCount,
        ...visibility,
      });
    } else if (q.type === "MATRIX") {
      questions.push({
        id: q.id,
        text: q.text,
        type: "MATRIX",
        matrix: matrixStats(acc.matrix!),
        ...visibility,
      });
    } else {
      assertNever(q.type, "question type");
    }
  }

  return {
    totalResponses,
    questions,
  };
};

// Incremental accumulator of transitions between visible questions: responses are fed
// one by one (add) and the result is read at the end (result), so getFormPaths does not
// hold every response in memory. orderedQuestions must be sorted by `order`.
const createPathsAccumulator = (orderedQuestions: { id: string; text: string; order: number }[]) => {
  const allQuestionIds = orderedQuestions.map((q) => q.id);
  const shownCount: Record<string, number> = {};
  const edgeCount = new Map<string, number>();
  let totalResponses = 0;

  return {
    add(response: { answers: unknown; visibleQuestionIds: unknown }) {
      totalResponses++;
      const visibleIds = resolveVisibleIdsForResponse(response, allQuestionIds);
      // The sequence the respondent actually saw, by `order`, skipping hidden questions
      // (not necessarily adjacent by `order`).
      const sequence = orderedQuestions.filter((q) => visibleIds.has(q.id));

      let prevId: string | null = null;
      for (const q of sequence) {
        shownCount[q.id] = (shownCount[q.id] || 0) + 1;
        const key = `${prevId ?? "__start__"}->${q.id}`;
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        prevId = q.id;
      }
    },

    result(): FormPathsDto {
      const nodes: QuestionPathNode[] = orderedQuestions.map((q) => ({
        questionId: q.id,
        text: q.text,
        order: q.order,
        shownCount: shownCount[q.id] || 0,
      }));

      const edges: QuestionPathEdge[] = Array.from(edgeCount.entries()).map(([key, count]) => {
        const [from, to] = key.split("->");
        return { fromQuestionId: from === "__start__" ? null : from, toQuestionId: to, count };
      });

      return { totalResponses, nodes, edges };
    },
  };
};

// Pure aggregation of transitions between visible questions, separate from getFormPaths
// so it can be tested without mocking Prisma.
export const buildFormPaths = (
  orderedQuestions: { id: string; text: string; order: number }[],
  responses: { answers: unknown; visibleQuestionIds: unknown }[],
): FormPathsDto => {
  const acc = createPathsAccumulator(orderedQuestions);
  for (const response of responses) acc.add(response);
  return acc.result();
};

export const getFormPaths = async (formId: string, userId: string): Promise<FormPathsDto> => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { questions: true },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  const orderedQuestions = [...form.questions].sort((a, b) => a.order - b.order);
  const acc = createPathsAccumulator(orderedQuestions);

  for await (const batch of responseBatches(formId)) {
    for (const response of batch) acc.add(response);
  }

  return acc.result();
};

/**
 * Pure funnel aggregation, separate from getFormFunnel so it can be tested without
 * mocking Prisma (same approach as buildFormPaths). attempts are ResponseAttempt rows,
 * completed or not.
 *
 * reachedCount comes from reachedQuestionIds: questions the respondent really saw (the
 * set only grows). visibleQuestionIds is NOT suitable: it means "questions that are
 * logically reachable right now", so it (a) already contains every unconditional question
 * from the first autosave even while the respondent is still on step one, and (b) loses
 * questions hidden by a later change of an answer. Rows created before reachedQuestionIds
 * existed fall back to visibleQuestionIds (the older, less precise approximation).
 */
type FunnelAttempt = {
  reachedQuestionIds?: unknown;
  visibleQuestionIds: unknown;
  completedAt: Date | null;
};

const createFunnelAccumulator = (orderedQuestions: { id: string; text: string; order: number }[]) => {
  const reachedCount: Record<string, number> = {};
  let totalAttempts = 0;
  let totalCompletions = 0;

  return {
    add(attempt: FunnelAttempt) {
      totalAttempts++;
      if (attempt.completedAt !== null) totalCompletions++;

      const source = attempt.reachedQuestionIds ?? attempt.visibleQuestionIds;
      const reachedIds = Array.isArray(source) ? (source as string[]) : [];

      for (const id of reachedIds) {
        reachedCount[id] = (reachedCount[id] || 0) + 1;
      }
    },

    result(): FormFunnelDto {
      const nodes: QuestionFunnelNode[] = orderedQuestions.map((q) => ({
        questionId: q.id,
        text: q.text,
        order: q.order,
        reachedCount: reachedCount[q.id] || 0,
      }));

      return {
        totalAttempts,
        totalCompletions,
        completionRate: totalAttempts > 0 ? totalCompletions / totalAttempts : 0,
        nodes,
      };
    },
  };
};

export const buildFormFunnel = (
  orderedQuestions: { id: string; text: string; order: number }[],
  attempts: FunnelAttempt[],
): FormFunnelDto => {
  const acc = createFunnelAccumulator(orderedQuestions);
  for (const attempt of attempts) acc.add(attempt);
  return acc.result();
};

export const getFormFunnel = async (formId: string, userId: string): Promise<FormFunnelDto> => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { questions: true },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  const orderedQuestions = [...form.questions].sort((a, b) => a.order - b.order);
  const acc = createFunnelAccumulator(orderedQuestions);

  for await (const batch of attemptBatches(formId)) {
    for (const attempt of batch) acc.add(attempt);
  }

  return acc.result();
};

// Record<QuestionType, ...> instead of a string array: when a question type is added you
// cannot forget to decide whether it supports detailed analytics (TypeScript demands the
// key). false -> 400 ANALYTICS_UNSUPPORTED_TYPE.
const DETAIL_ANALYTICS_SUPPORT: Record<QuestionType, boolean> = {
  TEXT: true,
  DATE: true,
  NUMBER: true,
  CHOICE_SINGLE: true,
  CHOICE_MULTI: true,
  BOOLEAN: true,
  RATING: true,
  SCALE: true,
  NPS: true,
  RANKING: true,
  MATRIX: true,
};

export const getQuestionAnalytics = async (
  formId: string,
  questionId: string,
  userId: string,
): Promise<QuestionAnalyticsDto> => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { questions: true },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  const question = form.questions.find((q) => q.id === questionId);

  if (!question) throw new AppError(ErrorCode.ANALYTICS_QUESTION_NOT_FOUND, 404);

  if (!DETAIL_ANALYTICS_SUPPORT[question.type]) {
    throw new AppError(ErrorCode.ANALYTICS_UNSUPPORTED_TYPE, 400);
  }

  // A Map, not a plain object: user text such as "constructor" or "__proto__" collides with
  // Object.prototype keys and breaks counting (counts[k] || 0 returns a function/prototype).
  const textCounts = new Map<string, number>();
  const textAnswers: string[] = [];
  let textAnswersTruncated = false;
  const numberCounts = new Map<number, number>();
  let numberSum = 0;
  let numberCount = 0;
  let numberMin = Infinity;
  let numberMax = -Infinity;
  const choiceCounts = new Map<string, number>();
  // "Other" answers: also a Map, with a cap on distinct values.
  const otherCounts = new Map<string, number>();
  const ranking =
    question.type === "RANKING"
      ? createRankingAccumulator((question.options ?? []) as StoredOption[])
      : undefined;
  const matrix =
    question.type === "MATRIX"
      ? createMatrixAccumulator(
          matrixRowsOf(question.config),
          (question.options ?? []) as StoredOption[],
        )
      : undefined;
  const scaleBounds = isScaleQuestionType(question.type)
    ? getScaleBounds(question.type, question.config as QuestionConfig | null)
    : undefined;
  let trueCount = 0;
  let falseCount = 0;
  let totalAnswers = 0;

  for await (const batch of responseBatches(formId)) {
    for (const response of batch) {
      const value = (response.answers as Answers)[questionId];
      if (value === undefined) continue;

      totalAnswers++;

      switch (question.type) {
        case "TEXT":
        case "DATE":
          if (typeof value !== "string") break;
          if (textCounts.has(value) || textCounts.size < analyticsConfig.maxTrackedTextValues) {
            textCounts.set(value, (textCounts.get(value) ?? 0) + 1);
          }
          if (textAnswers.length < analyticsConfig.maxTextAnswers) textAnswers.push(value);
          else textAnswersTruncated = true;
          break;
        case "NUMBER":
          if (typeof value !== "number") break;
          numberCounts.set(value, (numberCounts.get(value) ?? 0) + 1);
          numberSum += value;
          numberCount++;
          // Not Math.min(...nums): spreading a million arguments throws a RangeError.
          if (value < numberMin) numberMin = value;
          if (value > numberMax) numberMax = value;
          break;
        case "CHOICE_SINGLE":
        case "CHOICE_MULTI":
          for (const v of Array.isArray(value) ? value : [value]) {
            if (typeof v === "string" && v) choiceCounts.set(v, (choiceCounts.get(v) ?? 0) + 1);
          }
          if (isOtherSelected(question.type, question.options as StoredOption[], value)) {
            const text = (response.answers as Record<string, unknown>)[otherAnswerKey(questionId)];

            if (
              typeof text === "string" &&
              text &&
              (otherCounts.has(text) || otherCounts.size < analyticsConfig.maxTrackedTextValues)
            ) {
              otherCounts.set(text, (otherCounts.get(text) ?? 0) + 1);
            }
          }
          break;
        case "BOOLEAN":
          if (value === true) trueCount++;
          else if (value === false) falseCount++;
          break;
        case "RATING":
        case "SCALE":
        case "NPS":
          if (!isInScale(value, scaleBounds!)) break;
          numberCounts.set(value, (numberCounts.get(value) ?? 0) + 1);
          numberSum += value;
          numberCount++;
          if (value < numberMin) numberMin = value;
          if (value > numberMax) numberMax = value;
          break;
        case "RANKING":
          recordRanking(ranking!, value);
          break;
        case "MATRIX":
          recordMatrix(matrix!, value);
          break;
        default:
          assertNever(question.type, "question type");
      }
    }
  }

  const base = {
    id: question.id,
    text: question.text,
    description: question.description,
  };

  if (question.type === "TEXT" || question.type === "DATE") {
    return {
      question: { ...base, type: question.type },
      totalAnswers,
      // Top by frequency: for free text the full distribution is tens of thousands of unique
      // strings that nobody can display or read.
      distribution: Array.from(textCounts, ([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, analyticsConfig.maxTextDistribution),
      answers: textAnswers,
      answersTruncated: textAnswersTruncated,
    };
  }

  if (question.type === "NUMBER") {
    return {
      question: { ...base, type: "NUMBER" },
      totalAnswers,
      stats: {
        avg: numberCount > 0 ? numberSum / numberCount : 0,
        min: numberCount > 0 ? numberMin : 0,
        max: numberCount > 0 ? numberMax : 0,
      },
      distribution: Array.from(numberCounts, ([value, count]) => ({ value, count })).sort(
        (a, b) => a.value - b.value,
      ),
    };
  }

  if (question.type === "CHOICE_SINGLE" || question.type === "CHOICE_MULTI") {
    const options = (question.options ?? []) as StoredOption[];

    return {
      question: { ...base, type: question.type },
      totalAnswers,
      distribution: options.map((opt) => ({
        optionId: opt.id,
        text: opt.text,
        count: choiceCounts.get(opt.id) ?? 0,
      })),
      ...(getOtherOption(options)
        ? {
            otherAnswers: Array.from(otherCounts, ([value, count]) => ({ value, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, analyticsConfig.maxTextDistribution),
          }
        : {}),
    };
  }

  if (question.type === "RATING" || question.type === "SCALE" || question.type === "NPS") {
    return {
      question: { ...base, type: question.type },
      totalAnswers,
      stats: {
        avg: numberCount > 0 ? numberSum / numberCount : 0,
        min: numberCount > 0 ? numberMin : 0,
        max: numberCount > 0 ? numberMax : 0,
      },
      distribution: scaleValues(scaleBounds!).map((value) => ({
        value,
        count: numberCounts.get(value) ?? 0,
      })),
      ...(question.type === "NPS" ? { nps: computeNps(numberCounts) } : {}),
    };
  }

  if (question.type === "MATRIX") {
    return {
      question: { ...base, type: "MATRIX" },
      totalAnswers,
      matrix: matrixStats(matrix!),
    };
  }

  if (question.type === "RANKING") {
    return {
      question: { ...base, type: "RANKING" },
      totalAnswers,
      ranking: rankingStats((question.options ?? []) as StoredOption[], ranking!),
      rankedCount: ranking!.rankedCount,
    };
  }

  if (question.type === "BOOLEAN") {
    return {
      question: { ...base, type: "BOOLEAN" },
      totalAnswers,
      trueCount,
      falseCount,
    };
  }

  return assertNever(question.type, "question type");
};

export const getResponses = async (
  formId: string,
  userId: string,
  page = 1,
  limit = 10,
): Promise<ResponseListDto> => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  const skip = (page - 1) * limit;

  const [total, responses] = await Promise.all([
    prisma.response.count({
      where: { formId },
    }),
    prisma.response.findMany({
      where: { formId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        createdAt: true,
        language: true,
        // answers: true,
      },
    }),
  ]);

  return {
    total,
    page,
    limit,
    data: responses,
  };
};

export const getResponseById = async (
  formId: string,
  responseId: string,
  userId: string,
): Promise<ResponseDetailsDto> => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { questions: true },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  const response = await prisma.response.findUnique({
    where: { id: responseId },
  });

  if (!response || response.formId !== formId) {
    throw new AppError(ErrorCode.ANALYTICS_RESPONSE_NOT_FOUND, 404);
  }

  const rawAnswers = response.answers as Answers;
  const enrichedAnswers: EnrichedAnswer[] = [];

  for (const q of form.questions) {
    const userValue = rawAnswers[q.id];

    if (userValue === undefined || userValue === null) {
      continue;
    }

    let displayValue: string | number | string[] = "";

    const otherText = rawAnswers[otherAnswerKey(q.id)];
    // "Other" is shown together with the respondent's text: "Other: custom option".
    const withOtherText = (opt: StoredOption) =>
      opt.isOther && typeof otherText === "string" && otherText
        ? `${opt.text}: ${otherText}`
        : opt.text;

    if (q.type === "CHOICE_SINGLE") {
      const option = (q.options as StoredOption[] | null)?.find((o) => o.id === userValue);
      displayValue = option ? withOtherText(option) : `Опція видалена (${userValue})`;
    } else if (q.type === "CHOICE_MULTI") {
      const optionIds = userValue as string[];
      const options = q.options as StoredOption[] | null;

      displayValue = optionIds.map((id) => {
        const opt = options?.find((o) => o.id === id);
        return opt ? withOtherText(opt) : `Невідома опція (${id})`;
      });
    } else if (q.type === "MATRIX") {
      const options = q.options as StoredOption[] | null;
      const cells = userValue as Record<string, string>;

      // "Row: Column" in the question's row order; unanswered rows are skipped.
      displayValue = matrixRowsOf(q.config)
        .filter((row) => cells[row.id] !== undefined)
        .map((row) => {
          const column = options?.find((o) => o.id === cells[row.id]);
          return `${row.text}: ${column ? column.text : `Невідома опція (${cells[row.id]})`}`;
        });
    } else if (q.type === "RANKING") {
      const options = q.options as StoredOption[] | null;

      // "1. Coffee", "2. Tea": the array order is the ranking order.
      displayValue = (userValue as string[]).map((id, index) => {
        const opt = options?.find((o) => o.id === id);
        return `${index + 1}. ${opt ? opt.text : `Невідома опція (${id})`}`;
      });
    } else if (q.type === "BOOLEAN") {
      displayValue = userValue === true ? "Так" : "Ні";
    } else if (
      q.type === "TEXT" ||
      q.type === "DATE" ||
      q.type === "NUMBER" ||
      q.type === "RATING" ||
      q.type === "SCALE" ||
      q.type === "NPS"
    ) {
      // For these types the answer is a string/number (an object only occurs in MATRIX, above).
      displayValue =
        typeof userValue === "boolean" ? String(userValue) : (userValue as string | number | string[]);
    } else {
      assertNever(q.type, "question type");
    }

    enrichedAnswers.push({
      questionId: q.id,
      questionText: q.text || "Питання без назви",
      questionDescription: q.description,
      questionType: q.type,
      questionRequired: q.required,
      displayValue,
      rawValue: userValue,
    });
  }

  return {
    id: response.id,
    formId: response.formId,
    createdAt: response.createdAt,
    language: response.language,
    answers: enrichedAnswers,
  };
};

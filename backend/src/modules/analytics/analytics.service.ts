import { prisma } from "../../prisma/prisma.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { ErrorCode } from "@quorvia/shared-types";
import { Answers } from "../response/response.types.js";
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
 * visibleQuestionIds персистується лише для відповідей, надісланих після
 * впровадження conditional logic (Етап 2). Для старих відповідей (Json-поле
 * порожнє/null) - чесний fallback: вважаємо видимим кожне питання, на яке є
 * відповідь у answers (те, що й так робила аналітика до цієї фічі), тому
 * старі дані не "ламаються" заднім числом, а просто не мають точного
 * розрізнення "приховано" vs "показано, але пропущено".
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

type StoredOption = { id: string; text: string };

type QuestionAccumulator = {
  type: string;
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

  const responses = await prisma.response.findMany({
    where: { formId },
    select: { answers: true, visibleQuestionIds: true },
  });

  const totalResponses = responses.length;

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
      trueCount: 0,
      falseCount: 0,
    });
  }

  for (const response of responses) {
    const visibleIds = resolveVisibleIdsForResponse(response, allQuestionIds);
    const answers = response.answers as Answers;

    for (const qId of visibleIds) {
      const acc = accumulators.get(qId);
      if (!acc) continue; // питання видалене з форми після цієї відповіді

      acc.shownCount++;

      const value = answers?.[qId];
      if (value === undefined) continue; // показане, але пропущене (skippedCount)

      acc.answeredCount++;

      if (acc.type === "TEXT" || acc.type === "DATE") {
        const key = value as string;
        acc.textCounts!.set(key, (acc.textCounts!.get(key) || 0) + 1);
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
    }
  }

  return {
    totalResponses,
    questions,
  };
};

/**
 * Чиста функція агрегації переходів між видимими питаннями - винесена
 * окремо від getFormPaths, щоб тестувати без моку Prisma. orderedQuestions
 * мають бути відсортовані за order (getFormPaths це гарантує).
 */
export const buildFormPaths = (
  orderedQuestions: { id: string; text: string; order: number }[],
  responses: { answers: unknown; visibleQuestionIds: unknown }[],
): FormPathsDto => {
  const allQuestionIds = orderedQuestions.map((q) => q.id);
  const shownCount: Record<string, number> = {};
  const edgeCount = new Map<string, number>();

  for (const response of responses) {
    const visibleIds = resolveVisibleIdsForResponse(response, allQuestionIds);
    // Послідовність, у якій респондент фактично побачив питання - за order,
    // з пропуском прихованих (не обов'язково сусідні за order).
    const sequence = orderedQuestions.filter((q) => visibleIds.has(q.id));

    let prevId: string | null = null;
    for (const q of sequence) {
      shownCount[q.id] = (shownCount[q.id] || 0) + 1;
      const key = `${prevId ?? "__start__"}->${q.id}`;
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      prevId = q.id;
    }
  }

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

  return { totalResponses: responses.length, nodes, edges };
};

export const getFormPaths = async (formId: string, userId: string): Promise<FormPathsDto> => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { questions: true },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  const responses = await prisma.response.findMany({
    where: { formId },
    select: { answers: true, visibleQuestionIds: true },
  });

  const orderedQuestions = [...form.questions].sort((a, b) => a.order - b.order);

  return buildFormPaths(orderedQuestions, responses);
};

/**
 * Чиста функція агрегації funnel - винесена окремо від getFormFunnel, щоб
 * тестувати без моку Prisma (той самий підхід, що й buildFormPaths).
 * attempts - рядки ResponseAttempt (і завершені, і ні).
 *
 * reachedCount рахується з reachedQuestionIds - питань, які респондент
 * реально побачив (множина лише росте). visibleQuestionIds тут НЕ годиться:
 * це "питання, які зараз логічно прохідні", і воно (а) вже містить усі
 * питання без умови з першого autosave, навіть якщо респондент ще на
 * першому кроці, та (б) втрачає питання, приховані пізнішою зміною
 * відповіді. Для рядків, створених до появи reachedQuestionIds, лишається
 * fallback на visibleQuestionIds (старе, менш точне наближення).
 */
export const buildFormFunnel = (
  orderedQuestions: { id: string; text: string; order: number }[],
  attempts: {
    reachedQuestionIds?: unknown;
    visibleQuestionIds: unknown;
    completedAt: Date | null;
  }[],
): FormFunnelDto => {
  const reachedCount: Record<string, number> = {};

  for (const attempt of attempts) {
    const source = attempt.reachedQuestionIds ?? attempt.visibleQuestionIds;
    const reachedIds = Array.isArray(source) ? (source as string[]) : [];

    for (const id of reachedIds) {
      reachedCount[id] = (reachedCount[id] || 0) + 1;
    }
  }

  const totalAttempts = attempts.length;
  const totalCompletions = attempts.filter((a) => a.completedAt !== null).length;

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
};

export const getFormFunnel = async (formId: string, userId: string): Promise<FormFunnelDto> => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { questions: true },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  const attempts = await prisma.responseAttempt.findMany({
    where: { formId },
    select: { reachedQuestionIds: true, visibleQuestionIds: true, completedAt: true },
  });

  const orderedQuestions = [...form.questions].sort((a, b) => a.order - b.order);

  return buildFormFunnel(orderedQuestions, attempts);
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

  const responses = await prisma.response.findMany({
    where: { formId },
  });

  const values = responses
    .map((r) => (r.answers as Answers)[questionId])
    .filter((v) => v !== undefined);

  const totalAnswers = values.length;

  if (question.type === "TEXT" || question.type === "DATE") {
    const map: Record<string, number> = {};

    for (const val of values as string[]) {
      map[val] = (map[val] || 0) + 1;
    }

    return {
      question: {
        id: question.id,
        text: question.text,
        description: question.description,
        type: question.type,
      },
      totalAnswers,
      distribution: Object.entries(map).map(([value, count]) => ({
        value,
        count,
      })),
      answers: values as string[],
    };
  }

  if (question.type === "NUMBER") {
    const nums = values as number[];

    const map: Record<number, number> = {};
    for (const n of nums) {
      map[n] = (map[n] || 0) + 1;
    }

    return {
      question: {
        id: question.id,
        text: question.text,
        description: question.description,
        type: "NUMBER",
      },
      totalAnswers,
      stats: {
        avg: nums.reduce((a, b) => a + b, 0) / nums.length || 0,
        min: Math.min(...nums),
        max: Math.max(...nums),
      },
      distribution: Object.entries(map).map(([value, count]) => ({
        value: Number(value),
        count,
      })),
    };
  }

  if (question.type === "CHOICE_SINGLE" || question.type === "CHOICE_MULTI") {
    const map: Record<string, number> = {};

    for (const val of values) {
      if (Array.isArray(val)) {
        for (const v of val) {
          map[v] = (map[v] || 0) + 1;
        }
      } else if (typeof val === "string" && val) {
        map[val] = (map[val] || 0) + 1;
      }
    }

    const options = (question.options ?? []) as { id: string; text: string }[];

    const distribution = options.map((opt) => ({
      optionId: opt.id,
      text: opt.text,
      count: map[opt.id] || 0,
    }));

    return {
      question: {
        id: question.id,
        text: question.text,
        description: question.description,
        type: question.type,
      },
      totalAnswers,
      distribution,
    };
  }

  if (question.type === "BOOLEAN") {
    const bools = values as boolean[];

    return {
      question: {
        id: question.id,
        text: question.text,
        description: question.description,
        type: "BOOLEAN",
      },
      totalAnswers,
      trueCount: bools.filter(Boolean).length,
      falseCount: bools.filter((v) => !v).length,
    };
  }

  throw new AppError(ErrorCode.ANALYTICS_UNSUPPORTED_TYPE, 400);
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
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        createdAt: true,
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

    if (q.type === "CHOICE_SINGLE") {
      const option = (q.options as StoredOption[] | null)?.find((o) => o.id === userValue);
      displayValue = option ? option.text : `Опція видалена (${userValue})`;
    } else if (q.type === "CHOICE_MULTI") {
      const optionIds = userValue as string[];
      const options = q.options as StoredOption[] | null;

      displayValue = optionIds.map((id) => {
        const opt = options?.find((o) => o.id === id);
        return opt ? opt.text : `Невідома опція (${id})`;
      });
    } else if (q.type === "BOOLEAN") {
      displayValue = userValue === true ? "Так" : "Ні";
    } else {
      displayValue = typeof userValue === "boolean" ? String(userValue) : userValue;
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
    answers: enrichedAnswers,
  };
};

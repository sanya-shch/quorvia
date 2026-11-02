import { prisma } from "../../prisma/prisma.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { assertNever, ErrorCode, type QuestionType } from "@quorvia/shared-types";
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

/**
 * Відповіді форми порціями (keyset-пагінація), а не одним findMany на всю
 * таблицю: агрегації нижче інкрементальні, тож пам'ять обмежена розміром
 * порції, а не кількістю відповідей. Порядок (createdAt, id) детермінований
 * і обслуговується індексом (formId, createdAt, id).
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

/** Те саме для проходжень; порядок за (sessionKey, id) іде по унікальному індексу форми. */
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

type QuestionAccumulator = {
  type: QuestionType;
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
        if (!acc) continue; // питання видалене з форми після цієї відповіді

        acc.shownCount++;

        const value = answers?.[qId];
        if (value === undefined) continue; // показане, але пропущене (skippedCount)

        acc.answeredCount++;

        if (acc.type === "TEXT" || acc.type === "DATE") {
          const key = value as string;
          // Вільний текст має необмежену кількість різних значень: Map не
          // може рости безкінечно (для надвеликих форм топ-5 стає наближеним).
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
    } else {
      assertNever(q.type, "question type");
    }
  }

  return {
    totalResponses,
    questions,
  };
};

/**
 * Інкрементальний акумулятор переходів між видимими питаннями: відповіді
 * подаються по одній (add), результат знімається в кінці (result). Завдяки
 * цьому getFormPaths не тримає всі відповіді в пам'яті. orderedQuestions
 * мають бути відсортовані за order.
 */
const createPathsAccumulator = (orderedQuestions: { id: string; text: string; order: number }[]) => {
  const allQuestionIds = orderedQuestions.map((q) => q.id);
  const shownCount: Record<string, number> = {};
  const edgeCount = new Map<string, number>();
  let totalResponses = 0;

  return {
    add(response: { answers: unknown; visibleQuestionIds: unknown }) {
      totalResponses++;
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

/**
 * Чиста функція агрегації переходів між видимими питаннями - винесена
 * окремо від getFormPaths, щоб тестувати без моку Prisma.
 */
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

/**
 * Record<QuestionType, ...>, а не масив рядків: додаючи тип питання, не
 * вийде забути вирішити, чи підтримує він детальну аналітику (TypeScript
 * вимагатиме ключ). false -> 400 ANALYTICS_UNSUPPORTED_TYPE.
 */
const DETAIL_ANALYTICS_SUPPORT: Record<QuestionType, boolean> = {
  TEXT: true,
  DATE: true,
  NUMBER: true,
  CHOICE_SINGLE: true,
  CHOICE_MULTI: true,
  BOOLEAN: true,
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

  // Map, а не plain object: користувацький текст на кшталт "constructor"
  // чи "__proto__" збігається з вбудованими ключами Object.prototype і
  // ламає підрахунок (counts[k] || 0 повертає функцію/прототип).
  const textCounts = new Map<string, number>();
  const textAnswers: string[] = [];
  let textAnswersTruncated = false;
  const numberCounts = new Map<number, number>();
  let numberSum = 0;
  let numberCount = 0;
  let numberMin = Infinity;
  let numberMax = -Infinity;
  const choiceCounts = new Map<string, number>();
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
          // Не Math.min(...nums): spread мільйона аргументів падає з RangeError.
          if (value < numberMin) numberMin = value;
          if (value > numberMax) numberMax = value;
          break;
        case "CHOICE_SINGLE":
        case "CHOICE_MULTI":
          for (const v of Array.isArray(value) ? value : [value]) {
            if (typeof v === "string" && v) choiceCounts.set(v, (choiceCounts.get(v) ?? 0) + 1);
          }
          break;
        case "BOOLEAN":
          if (value === true) trueCount++;
          else if (value === false) falseCount++;
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
      // Топ за частотою: для вільного тексту повний розподіл - це десятки
      // тисяч унікальних рядків, які ні відобразити, ні прочитати.
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
    } else if (q.type === "TEXT" || q.type === "DATE" || q.type === "NUMBER") {
      displayValue = typeof userValue === "boolean" ? String(userValue) : userValue;
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
    answers: enrichedAnswers,
  };
};

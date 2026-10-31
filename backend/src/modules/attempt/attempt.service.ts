import { randomUUID } from "node:crypto";
import { prisma } from "../../prisma/prisma.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { ErrorCode } from "@quorvia/shared-types";
import { Answers } from "../response/response.types.js";
import { resolveVisibleQuestionIds, type QuestionLike } from "@quorvia/condition-engine";
import { buildUpsertAttemptSql } from "./attempt.sql.js";

/**
 * Зберігає "чернетку" проходження - на відміну від submitResponse, НЕ
 * валідує required-поля чи повноту: респондент, що заповнив половину
 * форми, - це нормальний, очікуваний стан для autosave, а не помилка.
 * Єдине, що робить сервер тут (як і в submitResponse) - перераховує
 * видимість на сирих відповідях і вирізає значення для прихованих умовою
 * питань, щоб funnel-дані лишались чесними навіть при застарілому
 * клієнтському стані.
 *
 * upsert по (formId, sessionKey) - повторні autosave-виклики того самого
 * проходження оновлюють один рядок, а не плодять нові на кожен keystroke.
 */
/**
 * Яка підмножина питань вважається "досягнутою" цим збереженням.
 *
 * Клієнт у покроковому режимі шле точний список показаних питань; режим
 * "все на одній сторінці" нічого не шле, і тоді показані = зараз видимі.
 * Id, яких немає у формі, відкидаються - клієнту не можна довіряти
 * довільні значення, а чужі/вигадані id зіпсували б funnel.
 *
 * Це НЕ перевіряється проти умов (питання могло стати прихованим саме
 * тому, що респондент змінив попередню відповідь - це й є кейс, заради
 * якого reached відокремлено від visible). Підробка клієнтом лише
 * спотворить funnel його ж власної форми, як і підроблені відповіді.
 */
export const resolveReachedQuestionIds = (
  formQuestionIds: ReadonlySet<string>,
  visibleQuestionIds: ReadonlySet<string>,
  clientReached: readonly string[] | undefined,
): string[] => {
  const source = clientReached ?? Array.from(visibleQuestionIds);

  return Array.from(new Set(source.filter((id) => formQuestionIds.has(id))));
};

/**
 * Зберігає "чернетку" проходження - на відміну від submitResponse, НЕ
 * валідує required-поля чи повноту: респондент, що заповнив половину
 * форми, - це нормальний, очікуваний стан для autosave, а не помилка.
 * Єдине, що робить сервер тут (як і в submitResponse) - перераховує
 * видимість на сирих відповідях і вирізає значення для прихованих умовою
 * питань, щоб funnel-дані лишались чесними навіть при застарілому
 * клієнтському стані.
 *
 * Один рядок на (formId, sessionKey): повторні autosave-виклики
 * оновлюють його, а не плодять нові на кожен keystroke. reachedQuestionIds
 * при цьому не перезаписується, а об'єднується зі збереженим значенням
 * в одному SQL-виразі (attempt.sql.ts), тому порядок запитів на нього не
 * впливає.
 */
export const saveAttempt = async (
  shareId: string,
  sessionKey: string,
  answers: Answers,
  reachedQuestionIds?: string[],
): Promise<{ id: string; updatedAt: Date }> => {
  const form = await prisma.form.findUnique({
    where: { shareId },
    include: { questions: true },
  });

  if (!form) {
    throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  }

  if (!form.isPublished) {
    throw new AppError(ErrorCode.FORM_NOT_PUBLISHED, 400);
  }

  const visibleQuestionIds = resolveVisibleQuestionIds(
    form.questions as unknown as QuestionLike[],
    answers,
  );

  const cleanedAnswers = Object.fromEntries(
    Object.entries(answers).filter(([questionId]) => visibleQuestionIds.has(questionId)),
  ) as Answers;

  const reached = resolveReachedQuestionIds(
    new Set(form.questions.map((q) => q.id)),
    visibleQuestionIds,
    reachedQuestionIds,
  );

  const [attempt] = await prisma.$queryRaw<{ id: string; updatedAt: Date }[]>(
    buildUpsertAttemptSql({
      id: randomUUID(),
      formId: form.id,
      sessionKey,
      answers: cleanedAnswers,
      visibleQuestionIds: Array.from(visibleQuestionIds),
      reachedQuestionIds: reached,
    }),
  );

  return { id: attempt.id, updatedAt: attempt.updatedAt };
};

import { prisma } from "../../prisma/prisma.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { ErrorCode } from "@quorvia/shared-types";
import { Answers } from "../response/response.types.js";
import { resolveVisibleQuestionIds, type QuestionLike } from "@quorvia/condition-engine";
import { toJson } from "../../shared/utils/helpers.js";

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
export const saveAttempt = async (
  shareId: string,
  sessionKey: string,
  answers: Answers,
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

  const attempt = await prisma.responseAttempt.upsert({
    where: { formId_sessionKey: { formId: form.id, sessionKey } },
    create: {
      formId: form.id,
      sessionKey,
      answers: toJson(cleanedAnswers),
      visibleQuestionIds: toJson(Array.from(visibleQuestionIds)),
    },
    update: {
      answers: toJson(cleanedAnswers),
      visibleQuestionIds: toJson(Array.from(visibleQuestionIds)),
      // updatedAt має @updatedAt в схемі - Prisma оновить сама, явно не
      // задаємо, щоб не розійтись із behaviour @updatedAt при майбутніх
      // змінах.
    },
  });

  return { id: attempt.id, updatedAt: attempt.updatedAt };
};

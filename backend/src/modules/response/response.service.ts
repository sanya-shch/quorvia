import { prisma } from "../../prisma/prisma.js";
import { buildResponseSchema } from "./response.validation.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { ErrorCode } from "@quorvia/shared-types";
import { Answers } from "./response.types.js";
import { resolveVisibleQuestionIds, type QuestionLike } from "@quorvia/condition-engine";
import { toJson } from "../../shared/utils/helpers.js";

export const submitResponse = async (shareId: string, answers: Answers, sessionKey?: string) => {
  const form = await prisma.form.findUnique({
    where: { shareId },
    include: {
      questions: true,
    },
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

  const schema = buildResponseSchema(form.questions, visibleQuestionIds);

  const result = schema.safeParse(answers);

  if (!result.success) {
    const formattedErrors = result.error.issues.map((err) => ({
      field: err.path[0],
      message: err.message,
    }));

    throw new AppError(ErrorCode.RESPONSE_VALIDATION_FAILED, 400, formattedErrors);
  }

  const cleanedAnswers = Object.fromEntries(
    Object.entries(result.data as Answers).filter(([questionId]) =>
      visibleQuestionIds.has(questionId),
    ),
  ) as Answers;

  const response = await prisma.response.create({
    data: {
      formId: form.id,
      answers: toJson(cleanedAnswers),
      visibleQuestionIds: toJson(Array.from(visibleQuestionIds)),
    },
  });

  if (sessionKey) {
    // updateMany, не update: якщо autosave жодного разу не спрацював
    // (наприклад, респондент заповнив і надіслав форму блискавично, до
    // першого debounced autosave), рядка ResponseAttempt може не бути
    // взагалі - це не помилка, просто funnel не матиме "проміжного" сліду
    // цього конкретного проходження, лишень фінальний Response.
    await prisma.responseAttempt.updateMany({
      where: { formId: form.id, sessionKey },
      data: { completedAt: new Date() },
    });
  }

  return response;
};

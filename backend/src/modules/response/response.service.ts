import { prisma } from "../../prisma/prisma.js";
import { buildResponseSchema, cleanAnswers } from "./response.validation.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { ErrorCode, resolveResponseLanguage } from "@quorvia/shared-types";
import { Answers } from "./response.types.js";
import { resolveVisibleQuestionIds, type QuestionLike } from "@quorvia/condition-engine";
import { toJson } from "../../shared/utils/helpers.js";
import { buildCompleteAttemptSql } from "../attempt/attempt.sql.js";

export const submitResponse = async (
  shareId: string,
  answers: Answers,
  sessionKey?: string,
  language?: string,
) => {
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

  const cleanedAnswers = cleanAnswers(form.questions, result.data as Answers, visibleQuestionIds);

  const response = await prisma.response.create({
    data: {
      formId: form.id,
      answers: toJson(cleanedAnswers),
      visibleQuestionIds: toJson(Array.from(visibleQuestionIds)),
      language: resolveResponseLanguage(language, form.defaultLanguage, form.languages),
    },
  });

  if (sessionKey) {
    // Рядка ResponseAttempt може не бути взагалі (респондент надіслав форму
    // блискавично, до першого debounced autosave) - тоді UPDATE просто
    // нічого не зачепить, це не помилка: funnel не матиме проміжного сліду
    // цього проходження, лишень фінальний Response.
    //
    // Заодно дописуємо до reachedQuestionIds усі видимі питання фінальної
    // відповіді: респондент, що дійшов до submit, бачив їх усі, навіть якщо
    // останній autosave (debounce 1.2 с) не встиг спрацювати.
    await prisma.$executeRaw(
      buildCompleteAttemptSql(form.id, sessionKey, Array.from(visibleQuestionIds)),
    );
  }

  return response;
};

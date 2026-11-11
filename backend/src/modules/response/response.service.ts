import { prisma } from "../../prisma/prisma.js";
import { buildResponseSchema, cleanAnswers } from "./response.validation.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { ErrorCode, resolveResponseLanguage } from "@quorvia/shared-types";
import { Answers } from "./response.types.js";
import { resolveVisibleQuestionIds, type QuestionLike } from "@quorvia/condition-engine";
import { toJson } from "../../shared/utils/helpers.js";
import { buildCompleteAttemptSql } from "../attempt/attempt.sql.js";
import { attachFilesToResponse, collectFileClaims } from "../file/file.service.js";
import { assertFormOpen, claimResponseSlot } from "../form/form.closing.js";
import { resolveEndScreen } from "../form/form.endRules.js";

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

  // Early answer for a form that is already closed. The authoritative decision is the atomic claim
  // below; this only avoids validating answers that cannot be accepted anyway.
  assertFormOpen(form);

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

  const responseLanguage = resolveResponseLanguage(language, form.defaultLanguage, form.languages);

  // Decided here, from the answers the server accepted, never from what the client claims. The
  // winning rule is stored with the response (analytics can tell the outcomes apart).
  const { endRuleId, screen: endScreen } = resolveEndScreen(
    form,
    cleanedAnswers,
    visibleQuestionIds,
    responseLanguage,
  );

  const data = {
    formId: form.id,
    answers: toJson(cleanedAnswers),
    visibleQuestionIds: toJson(Array.from(visibleQuestionIds)),
    language: responseLanguage,
    endRuleId,
  };

  // Files uploaded for FILE questions are attached in the same transaction that creates the
  // response: either the response and all its files exist, or neither does. Forms without file
  // answers take the plain path.
  const fileClaims = collectFileClaims(form.questions, cleanedAnswers, visibleQuestionIds);

  // One transaction: take a place (the atomic closing check), create the response and attach its
  // files. If any step fails, none of them happened.
  const response = await prisma.$transaction(async (tx) => {
    await claimResponseSlot(tx, form.id);

    const created = await tx.response.create({ data });

    await attachFilesToResponse(tx, {
      formId: form.id,
      responseId: created.id,
      sessionKey,
      claims: fileClaims,
    });

    return created;
  });

  if (sessionKey) {
    // The ResponseAttempt row may not exist at all (the respondent submitted before the first
    // debounced autosave); the UPDATE then touches nothing, which is not an error: the funnel
    // just has no intermediate trace of this session, only the final Response.
    //
    // We also add every visible question of the final response to reachedQuestionIds: someone
    // who reached submit saw them all, even if the last autosave (1.2 s debounce) did not fire.
    await prisma.$executeRaw(
      buildCompleteAttemptSql(form.id, sessionKey, Array.from(visibleQuestionIds)),
    );
  }

  return { ...response, endScreen };
};

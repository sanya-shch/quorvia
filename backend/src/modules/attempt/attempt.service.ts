import { randomUUID } from "node:crypto";
import { prisma } from "../../prisma/prisma.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { ErrorCode } from "@quorvia/shared-types";
import { Answers } from "../response/response.types.js";
import { resolveVisibleQuestionIds, type QuestionLike } from "@quorvia/condition-engine";
import { buildUpsertAttemptSql } from "./attempt.sql.js";
import type { SaveAttemptDto } from "./attempt.types.js";
import { assertFormOpen } from "../form/form.closing.js";
import { fullMatchingQuota } from "../form/form.quotas.js";

/**
 * Saves a session "draft". Unlike submitResponse it does NOT validate required fields or
 * completeness: a half-filled form is the normal state for autosave. The only thing the
 * server does here (as in submitResponse) is recompute visibility on the raw answers and
 * cut values of questions hidden by a condition, so funnel data stays honest even with
 * stale client state.
 *
 * One row per (formId, sessionKey): repeated autosaves update it instead of creating rows
 * per keystroke.
 */
/**
 * Which questions count as "reached" by this save.
 *
 * In step-by-step mode the client sends the exact list of shown questions; all-at-once
 * mode sends nothing and shown = currently visible. Ids that are not in the form are
 * dropped: arbitrary client values cannot be trusted and bogus ids would corrupt the funnel.
 *
 * It is NOT checked against conditions (a question may have become hidden exactly because
 * the respondent changed an earlier answer, which is why reached is separate from
 * visible). A forged list only skews the funnel of the sender's own form.
 */
export const resolveReachedQuestionIds = (
  formQuestionIds: ReadonlySet<string>,
  visibleQuestionIds: ReadonlySet<string>,
  clientReached: readonly string[] | undefined,
): string[] => {
  const source = clientReached ?? Array.from(visibleQuestionIds);

  return Array.from(new Set(source.filter((id) => formQuestionIds.has(id))));
};

// Saves a session "draft" (see above). reachedQuestionIds is not overwritten but merged
// with the stored value in one SQL statement (attempt.sql.ts), so the request order does
// not matter.
export const saveAttempt = async (
  shareId: string,
  sessionKey: string,
  answers: Answers,
  reachedQuestionIds?: string[],
): Promise<SaveAttemptDto> => {
  const form = await prisma.form.findUnique({
    where: { shareId },
    include: { questions: true, quotas: true },
  });

  if (!form) {
    throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  }

  if (!form.isPublished) {
    throw new AppError(ErrorCode.FORM_NOT_PUBLISHED, 400);
  }

  // A closed form records no more drafts either: the funnel should not grow after the close.
  assertFormOpen(form);

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

  // Tells the respondent early that these answers fall into a quota that is full, so they do not
  // fill in the rest of the form just to be refused at the end. The draft is saved all the same
  // (they did reach these questions); the submit is what refuses. Only the owner's message for the
  // respondent is sent, never the quota itself.
  const full = fullMatchingQuota(form.quotas, cleanedAnswers, visibleQuestionIds);

  return {
    id: attempt.id,
    updatedAt: attempt.updatedAt,
    quotaFull: full ? { message: full.message ?? null } : null,
  };
};

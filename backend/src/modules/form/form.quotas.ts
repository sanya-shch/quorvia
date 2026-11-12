import type { Prisma } from "@prisma/client";
import {
  ErrorCode,
  normalizeConditionGroup,
  QUOTA_LIMITS,
  type FormQuota,
  type QuestionType,
} from "@quorvia/shared-types";
import { AppError } from "../../shared/middleware/errorHandler.js";
import {
  conditionHolds,
  findConditionIssues,
  type ConditionIssueReason,
} from "./form.conditionMatch.js";

// Quotas as stored (Prisma returns the condition as Json): the shape is checked again instead of
// trusted, so a damaged row cannot turn a submit into a crash.
export interface StoredQuota {
  id: string;
  name: string;
  condition: unknown;
  limit: number;
  count: number;
  message?: string | null;
}

// A quota whose condition is damaged is skipped (it can never match), not a reason to fail.
export const toQuota = (stored: StoredQuota): FormQuota | null => {
  const condition = normalizeConditionGroup(stored.condition);

  return condition ? { ...stored, condition } : null;
};

// The quotas this response counts in: those whose condition the accepted answers satisfy, in a
// fixed order (by id). The order matters: submit increments them one by one, and every request
// taking the same locks in the same order cannot deadlock with another.
export const matchingQuotas = (
  quotas: readonly StoredQuota[],
  answers: Record<string, unknown>,
  visibleQuestionIds: ReadonlySet<string>,
): FormQuota[] =>
  quotas
    .map(toQuota)
    .filter((quota): quota is FormQuota => quota !== null)
    .filter((quota) => conditionHolds(quota.condition, answers, visibleQuestionIds))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// Whether the answers given so far already fall into a quota that is full. Used while the
// respondent is still filling the form, so they are told early instead of after the last question.
// Only quotas whose condition is already decided by the visible answers can match; a quota on a
// question that has not been answered yet simply does not match (yet).
export const fullMatchingQuota = (
  quotas: readonly StoredQuota[],
  answers: Record<string, unknown>,
  visibleQuestionIds: ReadonlySet<string>,
): FormQuota | null =>
  matchingQuotas(quotas, answers, visibleQuestionIds).find((quota) => quota.count >= quota.limit) ??
  null;

export interface QuotaIssue {
  quotaId: string;
  questionId: string;
  reason: ConditionIssueReason;
}

export const findQuotaIssues = (
  quotas: readonly { id: string; condition: unknown }[],
  questions: readonly { id: string; type: QuestionType }[],
): QuotaIssue[] =>
  quotas.flatMap((quota) => {
    const condition = normalizeConditionGroup(quota.condition);

    // A damaged condition matches nothing and references nothing: nothing for a question to break.
    if (!condition) return [];

    return findConditionIssues(condition, questions).map((issue) => ({
      quotaId: quota.id,
      ...issue,
    }));
  });

// What stops a question from being deleted while a quota still looks at it: the stored quotas are
// checked against the question list the form is saved with.
export const assertQuotasValid = (
  quotas: readonly { id: string; condition: unknown }[],
  questions: readonly { id: string; type: QuestionType }[],
): void => {
  const issues = findQuotaIssues(quotas, questions);

  if (issues.length > 0) {
    throw new AppError(ErrorCode.FORM_INVALID_QUOTAS, 400, issues);
  }
};

export const assertQuotaCapacity = (existing: number): void => {
  if (existing >= QUOTA_LIMITS.perForm) throw new AppError(ErrorCode.QUOTA_LIMIT_REACHED, 409);
};

// What a respondent who is turned away is told. Only the owner's message for the respondent: the
// name and the condition of the quota are the owner's, and say more about the survey than the
// respondent needs (the name may be an internal label).
export const quotaFullError = (message: string | null | undefined) =>
  new AppError(ErrorCode.QUOTA_FULL, 409, { message: message ?? null });

// Early refusal, before the answers are validated and files are attached: the respondent's answers
// already fall into a full quota. Only an optimization and an early answer; the authoritative
// decision is claimQuotaPlaces, because the quota can fill up between this check and the submit.
export const assertQuotasOpen = (
  quotas: readonly StoredQuota[],
  answers: Record<string, unknown>,
  visibleQuestionIds: ReadonlySet<string>,
): void => {
  const full = fullMatchingQuota(quotas, answers, visibleQuestionIds);

  if (full) throw quotaFullError(full.message);
};

// A quota can be changed or deleted while a submit is running. When the conditional update finds
// no place, the quota is read again: gone means there is nothing to claim, a limit raised meanwhile
// means a place after all (a few tries), and otherwise it really is full.
const MAX_CLAIM_ATTEMPTS = 3;

/**
 * Takes one place in every given quota, atomically: this is the authoritative quota check.
 *
 * For each quota the conditional UPDATE succeeds only while count < limit and increments the counter
 * in the same statement; Postgres locks the row for it, so two submits racing for the last place are
 * serialized and the second matches no row (reading the count and writing it back separately would
 * let both through, one over the limit). It runs inside the transaction that creates the response:
 * when one quota is full the whole transaction fails, and the places already taken (in the other
 * quotas, and in the form itself) are rolled back with it.
 *
 * The quotas are processed in the order they are given (matchingQuotas sorts them by id), so
 * requests never wait for each other's locks in opposite orders.
 *
 * Returns the ids of the quotas the response is now counted in.
 */
export const claimQuotaPlaces = async (
  tx: Prisma.TransactionClient,
  quotas: readonly FormQuota[],
): Promise<string[]> => {
  const claimed: string[] = [];

  for (const quota of quotas) {
    let done = false;

    for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS && !done; attempt += 1) {
      const { count } = await tx.formQuota.updateMany({
        where: { id: quota.id, count: { lt: tx.formQuota.fields.limit } },
        data: { count: { increment: 1 } },
      });

      if (count === 1) {
        claimed.push(quota.id);
        done = true;
        continue;
      }

      const current = await tx.formQuota.findUnique({
        where: { id: quota.id },
        select: { count: true, limit: true, message: true },
      });

      // Deleted while this submit was running: nothing to take a place in.
      if (!current) {
        done = true;
      } else if (current.count >= current.limit) {
        throw quotaFullError(current.message);
      }
    }

    // Still no place after the retries although it keeps looking free: treat it as full rather than
    // accept a response that was not counted.
    if (!done) throw quotaFullError(quota.message);
  }

  return claimed;
};

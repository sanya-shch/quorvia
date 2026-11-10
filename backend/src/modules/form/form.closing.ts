import type { Prisma } from "@prisma/client";
import {
  CLOSED_ERROR_CODES,
  getClosedReason,
  type ClosableForm,
  type FormClosedReason,
} from "@quorvia/shared-types";
import { AppError } from "../../shared/middleware/errorHandler.js";

// 410 Gone: the form exists but will not take answers any more.
const closedError = (reason: FormClosedReason) => new AppError(CLOSED_ERROR_CODES[reason], 410);

// Fails fast for a form that is already closed, using the data the caller has already loaded.
export const assertFormOpen = (form: ClosableForm, now: Date = new Date()): void => {
  const reason = getClosedReason(form, now);

  if (reason) throw closedError(reason);
};

/**
 * Takes one place for a new response, atomically. This is the authoritative closing check.
 *
 * The conditional UPDATE only succeeds while the form is open (before closesAt, and with fewer
 * responses than maxResponses) and increments the counter in the same statement. Postgres locks the
 * row for the update, so two submits racing for the last place are serialized: the first one makes
 * the counter reach the limit, the second one then matches no row. Reading the count and writing it
 * back separately would let both through (the 101st response).
 *
 * It runs inside the transaction that creates the response, so a failure later rolls the place back.
 */
export const claimResponseSlot = async (
  tx: Prisma.TransactionClient,
  formId: string,
  now: Date = new Date(),
): Promise<void> => {
  const { count } = await tx.form.updateMany({
    where: {
      id: formId,
      AND: [
        { OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
        { OR: [{ maxResponses: null }, { responseCount: { lt: tx.form.fields.maxResponses } }] },
      ],
    },
    data: { responseCount: { increment: 1 } },
  });

  if (count === 1) return;

  // No place: find out which rule closed the form, for the message.
  const form = await tx.form.findUnique({
    where: { id: formId },
    select: { closesAt: true, maxResponses: true, responseCount: true },
  });

  throw closedError(form ? (getClosedReason(form, now) ?? "LIMIT") : "LIMIT");
};

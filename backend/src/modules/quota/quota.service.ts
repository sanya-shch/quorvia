import { Prisma } from "@prisma/client";
import {
  ErrorCode,
  normalizeConditionGroup,
  type ConditionGroup,
  type FormQuota,
} from "@quorvia/shared-types";
import { prisma } from "../../prisma/prisma.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { toJson } from "../../shared/utils/helpers.js";
import { conditionHolds } from "../form/form.conditionMatch.js";
import { assertQuotaCapacity, assertQuotasValid, toQuota } from "../form/form.quotas.js";
import type { CreateQuotaInput, UpdateQuotaInput } from "./quota.types.js";

// Responses are read in pages so a recount of a big form does not load them all at once.
const RECOUNT_BATCH = 1_000;
// A recount holds the quota's row lock for as long as it reads (submits that count in this quota
// wait for it), so it gets more than the 5 s default of an interactive transaction, but not forever.
const RECOUNT_TIMEOUT_MS = 60_000;

type Tx = Prisma.TransactionClient;

// The form, if it is the user's: the questions come along because a quota's condition is checked
// against them.
const getOwnedForm = async (formId: string, userId: string) => {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { id: true, userId: true, questions: { select: { id: true, type: true } } },
  });

  if (!form) throw new AppError(ErrorCode.FORM_NOT_FOUND, 404);
  if (form.userId !== userId) throw new AppError(ErrorCode.FORM_FORBIDDEN, 403);

  return form;
};

const toDto = (row: Parameters<typeof toQuota>[0]): FormQuota | null => toQuota(row);

// The condition as it will be stored. The request schema already checked it; the shared normalizer
// is what every reader of stored quotas uses, so what is stored is what they will accept.
const storedCondition = (condition: ConditionGroup): ConditionGroup => {
  const normalized = normalizeConditionGroup(condition);

  if (!normalized) throw new AppError(ErrorCode.REQUEST_BODY_INVALID, 400);

  return normalized;
};

// How many of the form's responses satisfy the condition, counted exactly as a submit would
// (answers of visible questions only). Responses from before the visible questions were recorded
// count every question of the form as visible.
const countMatching = async (
  client: Tx,
  formId: string,
  condition: ConditionGroup,
  allQuestionIds: ReadonlySet<string>,
): Promise<number> => {
  let count = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await client.response.findMany({
      where: { formId },
      orderBy: { id: "asc" },
      take: RECOUNT_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, answers: true, visibleQuestionIds: true },
    });

    for (const row of rows) {
      const visible = Array.isArray(row.visibleQuestionIds)
        ? new Set(row.visibleQuestionIds.filter((id): id is string => typeof id === "string"))
        : allQuestionIds;

      if (conditionHolds(condition, (row.answers ?? {}) as Record<string, unknown>, visible)) {
        count += 1;
      }
    }

    if (rows.length < RECOUNT_BATCH) return count;

    cursor = rows[rows.length - 1]!.id;
  }
};

// Takes the quota's row lock. Submits that count in the quota increment it with an UPDATE, which
// waits for this lock; so while it is held no response can be counted behind the recount's back,
// and a response that was counted before is already committed and is seen by it.
const lockQuota = async (tx: Tx, quotaId: string) => {
  await tx.$queryRaw`SELECT "id" FROM "FormQuota" WHERE "id" = ${quotaId} FOR UPDATE`;
};

const findQuota = async (formId: string, quotaId: string) => {
  const quota = await prisma.formQuota.findFirst({ where: { id: quotaId, formId } });

  if (!quota) throw new AppError(ErrorCode.QUOTA_NOT_FOUND, 404);

  return quota;
};

export const listQuotas = async (formId: string, userId: string): Promise<FormQuota[]> => {
  await getOwnedForm(formId, userId);

  const rows = await prisma.formQuota.findMany({
    where: { formId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map(toDto).filter((quota): quota is FormQuota => quota !== null);
};

export const createQuota = async (
  formId: string,
  userId: string,
  input: CreateQuotaInput,
): Promise<FormQuota> => {
  const form = await getOwnedForm(formId, userId);
  const condition = storedCondition(input.condition);

  assertQuotasValid([{ id: "new", condition }], form.questions);

  // A responses that were counted already: a quota created on a form that has answers starts from
  // what they say, not from zero, so it limits the real total.
  const created = await prisma.$transaction(
    async (tx) => {
      assertQuotaCapacity(await tx.formQuota.count({ where: { formId } }));

      const count = await countMatching(
        tx,
        formId,
        condition,
        new Set(form.questions.map((q) => q.id)),
      );

      return tx.formQuota.create({
        data: {
          formId,
          name: input.name,
          condition: toJson(condition),
          limit: input.limit,
          count,
          message: input.message || null,
        },
      });
    },
    { timeout: RECOUNT_TIMEOUT_MS },
  );

  return toDto(created)!;
};

export const updateQuota = async (
  formId: string,
  quotaId: string,
  userId: string,
  input: UpdateQuotaInput,
): Promise<FormQuota> => {
  const form = await getOwnedForm(formId, userId);

  await findQuota(formId, quotaId);

  const condition = input.condition ? storedCondition(input.condition) : null;

  if (condition) assertQuotasValid([{ id: quotaId, condition }], form.questions);

  const updated = await prisma.$transaction(
    async (tx) => {
      await lockQuota(tx, quotaId);

      const data: Prisma.FormQuotaUpdateInput = {};

      if (input.name !== undefined) data.name = input.name;
      if (input.limit !== undefined) data.limit = input.limit;
      if (input.message !== undefined) data.message = input.message || null;

      // The count belongs to the condition: a different condition means a different set of
      // responses, so it is counted again instead of keeping a number that no longer means anything.
      if (condition) {
        data.condition = toJson(condition);
        data.count = await countMatching(
          tx,
          formId,
          condition,
          new Set(form.questions.map((q) => q.id)),
        );
      }

      return tx.formQuota.update({ where: { id: quotaId }, data });
    },
    { timeout: RECOUNT_TIMEOUT_MS },
  );

  return toDto(updated)!;
};

export const deleteQuota = async (formId: string, quotaId: string, userId: string) => {
  await getOwnedForm(formId, userId);
  await findQuota(formId, quotaId);

  // The responses keep the id in `quotaIds`; it is a record of what happened, not a reference.
  await prisma.formQuota.delete({ where: { id: quotaId } });
};

// Counts the quota again from the responses. The counter is kept by the submit, so this is for
// when it cannot be trusted: after responses were removed by hand, or after a bug.
export const recountQuota = async (
  formId: string,
  quotaId: string,
  userId: string,
): Promise<FormQuota> => {
  const form = await getOwnedForm(formId, userId);
  const stored = await findQuota(formId, quotaId);
  const condition = normalizeConditionGroup(stored.condition);

  // A damaged condition matches nothing: nothing to count, and it is the owner's to fix or delete.
  if (!condition) throw new AppError(ErrorCode.FORM_INVALID_QUOTAS, 400);

  const updated = await prisma.$transaction(
    async (tx) => {
      await lockQuota(tx, quotaId);

      const count = await countMatching(
        tx,
        formId,
        condition,
        new Set(form.questions.map((q) => q.id)),
      );

      return tx.formQuota.update({ where: { id: quotaId }, data: { count } });
    },
    { timeout: RECOUNT_TIMEOUT_MS },
  );

  return toDto(updated)!;
};

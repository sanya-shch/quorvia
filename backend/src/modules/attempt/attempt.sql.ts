import { Prisma } from "@prisma/client";

/**
 * Atomic union of two JSON arrays of ids (a set without duplicates).
 *
 * `reachedQuestionIds` only grows, so the union is commutative: two autosave requests that
 * arrive out of order (or in parallel from two tabs) give the same result. Doing it as
 * read-modify-write in Node would lose ids written by another request between the SELECT
 * and the UPDATE. Here everything runs in one SQL statement under the row lock of
 * ON CONFLICT DO UPDATE / UPDATE.
 */
const mergeReachedSql = (incoming: Prisma.Sql) => Prisma.sql`(
  SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
  FROM jsonb_array_elements(
    COALESCE("ResponseAttempt"."reachedQuestionIds", '[]'::jsonb) || ${incoming}
  ) AS merged(elem)
)`;

export type UpsertAttemptParams = {
  id: string;
  formId: string;
  sessionKey: string;
  answers: unknown;
  visibleQuestionIds: string[];
  reachedQuestionIds: string[];
};

/**
 * INSERT ... ON CONFLICT (formId, sessionKey) DO UPDATE instead of a Prisma upsert: Prisma
 * cannot express "new value = old union new". Prisma generates `id` on the client
 * (@default(uuid())) and the DB has no default, so it is passed explicitly. completedAt is
 * left alone on purpose.
 */
export const buildUpsertAttemptSql = (p: UpsertAttemptParams) => {
  const reached = JSON.stringify(p.reachedQuestionIds);

  return Prisma.sql`
    INSERT INTO "ResponseAttempt"
      ("id", "formId", "sessionKey", "answers", "visibleQuestionIds", "reachedQuestionIds", "updatedAt")
    VALUES (
      ${p.id}, ${p.formId}, ${p.sessionKey},
      ${JSON.stringify(p.answers)}::jsonb,
      ${JSON.stringify(p.visibleQuestionIds)}::jsonb,
      ${reached}::jsonb,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("formId", "sessionKey") DO UPDATE SET
      "answers" = EXCLUDED."answers",
      "visibleQuestionIds" = EXCLUDED."visibleQuestionIds",
      "reachedQuestionIds" = ${mergeReachedSql(Prisma.sql`EXCLUDED."reachedQuestionIds"`)},
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "id", "updatedAt"
  `;
};

// Marks the session completed and adds every question of the final Response to reached.
// Whoever submitted the form has by definition seen every question on their path, even if
// the debounced autosave (1.2 s) did not save the last step.
export const buildCompleteAttemptSql = (
  formId: string,
  sessionKey: string,
  reachedQuestionIds: string[],
) => Prisma.sql`
  UPDATE "ResponseAttempt"
  SET "completedAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP,
      "reachedQuestionIds" = ${mergeReachedSql(Prisma.sql`${JSON.stringify(reachedQuestionIds)}::jsonb`)}
  WHERE "formId" = ${formId} AND "sessionKey" = ${sessionKey}
`;

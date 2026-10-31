import { Prisma } from "@prisma/client";

/**
 * Атомарне об'єднання двох JSON-масивів id (множина без дублікатів).
 *
 * `reachedQuestionIds` лише зростає, тому об'єднання комутативне: два
 * autosave-запити, що прийшли не в порядку відправлення (або паралельно з
 * двох вкладок), дають той самий результат. Робити це через
 * read-modify-write у Node не можна - між SELECT і UPDATE інший запит
 * міг дописати свої id, і вони б загубились. Тут усе виконується в одному
 * SQL-виразі під row-lock'ом ON CONFLICT DO UPDATE / UPDATE.
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
 * INSERT ... ON CONFLICT (formId, sessionKey) DO UPDATE замість Prisma
 * upsert: Prisma не вміє виразити "нове значення = старе ∪ нове".
 * `id` Prisma генерує на клієнті (@default(uuid())), у БД дефолту немає -
 * тому передаємо його явно. completedAt навмисно не чіпаємо.
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

/**
 * Позначає проходження завершеним і дописує до reached усі питання
 * фінального Response. Респондент, що надіслав форму, за визначенням
 * побачив усі питання свого шляху - навіть якщо debounce-autosave (1.2 с)
 * не встиг зберегти останній крок перед submit.
 */
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

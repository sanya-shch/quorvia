import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { buildCompleteAttemptSql, buildUpsertAttemptSql } from "./attempt.sql.js";

/**
 * Інтеграційний тест SQL, який Prisma не вміє виразити (union reachedQuestionIds).
 * Використовує РЕАЛЬНІ міграції проєкту поверх PGlite (Postgres у WASM) - без
 * docker і без моків Prisma, тому перевіряє справжню поведінку jsonb-злиття.
 */
const MIGRATIONS_DIR = join(import.meta.dirname, "../../../prisma/migrations");

let db: PGlite;

const run = (sql: Prisma.Sql) => db.query<{ id: string; updatedAt: Date }>(sql.text, sql.values);

const upsert = (reached: string[], extra: Partial<Parameters<typeof buildUpsertAttemptSql>[0]> = {}) =>
  run(
    buildUpsertAttemptSql({
      id: crypto.randomUUID(),
      formId: "form-1",
      sessionKey: "session-1",
      answers: {},
      visibleQuestionIds: [],
      reachedQuestionIds: reached,
      ...extra,
    }),
  );

const readAttempt = async () => {
  const { rows } = await db.query<{
    answers: Record<string, unknown>;
    reachedQuestionIds: string[] | null;
    completedAt: Date | null;
  }>(`SELECT "answers", "reachedQuestionIds", "completedAt" FROM "ResponseAttempt"`);
  return rows;
};

beforeAll(async () => {
  db = new PGlite();
  for (const dir of readdirSync(MIGRATIONS_DIR).sort()) {
    const file = join(MIGRATIONS_DIR, dir, "migration.sql");
    if (existsSync(file)) await db.exec(readFileSync(file, "utf8"));
  }
  await db.exec(`
    INSERT INTO "User" ("id","email","password") VALUES ('user-1','a@b.c','x');
    INSERT INTO "Form" ("id","title","userId","shareId") VALUES ('form-1','F','user-1','share-1');
  `);
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`DELETE FROM "ResponseAttempt"`);
});

describe("buildUpsertAttemptSql", () => {
  it("створює рядок із reachedQuestionIds при першому збереженні", async () => {
    const { rows } = await upsert(["q1"], { answers: { q1: "a" } });

    expect(rows[0].id).toBeTruthy();
    const [attempt] = await readAttempt();
    expect(attempt.reachedQuestionIds).toEqual(["q1"]);
    expect(attempt.answers).toEqual({ q1: "a" });
  });

  it("другий upsert того ж проходження оновлює один рядок і ОБ'ЄДНУЄ reached", async () => {
    await upsert(["q1", "q2"]);
    await upsert(["q3"]);

    const attempts = await readAttempt();
    expect(attempts).toHaveLength(1);
    expect([...attempts[0].reachedQuestionIds!].sort()).toEqual(["q1", "q2", "q3"]);
  });

  it("сценарій з рев'ю: питання, приховане пізнішою зміною відповіді, лишається досягнутим", async () => {
    // Q1=Yes -> показано Q2; потім Q1=No -> Q2 приховане (visible без q2).
    await upsert(["q1", "q2"], { visibleQuestionIds: ["q1", "q2"], answers: { q1: "yes" } });
    await upsert(["q1"], { visibleQuestionIds: ["q1"], answers: { q1: "no" } });

    const [attempt] = await readAttempt();
    expect([...attempt.reachedQuestionIds!].sort()).toEqual(["q1", "q2"]);
    expect(attempt.answers).toEqual({ q1: "no" });
  });

  it("порядок запитів не впливає на результат (out-of-order autosave)", async () => {
    await upsert(["q1", "q2", "q3"]);
    await upsert(["q1"]); // "старий" запит, що дійшов пізніше

    const [attempt] = await readAttempt();
    expect([...attempt.reachedQuestionIds!].sort()).toEqual(["q1", "q2", "q3"]);
  });

  it("не дублює id при повторному збереженні того самого набору", async () => {
    await upsert(["q1", "q2"]);
    await upsert(["q2", "q1", "q1"]);

    const [attempt] = await readAttempt();
    expect([...attempt.reachedQuestionIds!].sort()).toEqual(["q1", "q2"]);
  });

  it("порожній reached не стирає накопичене", async () => {
    await upsert(["q1"]);
    await upsert([]);

    const [attempt] = await readAttempt();
    expect(attempt.reachedQuestionIds).toEqual(["q1"]);
  });

  it("продовжує накопичення для legacy-рядка з reachedQuestionIds = NULL", async () => {
    await db.exec(`
      INSERT INTO "ResponseAttempt" ("id","formId","sessionKey","answers","updatedAt")
      VALUES ('legacy','form-1','session-1','{}'::jsonb, CURRENT_TIMESTAMP)
    `);

    await upsert(["q1"]);

    const [attempt] = await readAttempt();
    expect(attempt.reachedQuestionIds).toEqual(["q1"]);
  });

  it("не чіпає completedAt", async () => {
    await upsert(["q1"]);
    await run(buildCompleteAttemptSql("form-1", "session-1", ["q1"]));
    await upsert(["q2"]);

    const [attempt] = await readAttempt();
    expect(attempt.completedAt).not.toBeNull();
  });

  it("різні sessionKey - різні рядки", async () => {
    await upsert(["q1"], { sessionKey: "s-a" });
    await upsert(["q2"], { sessionKey: "s-b" });

    expect(await readAttempt()).toHaveLength(2);
  });

  it("безпечно передає спецсимволи в sessionKey і answers (параметри, не конкатенація)", async () => {
    const evil = `x'); DROP TABLE "ResponseAttempt"; --`;
    await upsert(["q1"], { sessionKey: evil, answers: { q1: evil } });

    const [attempt] = await readAttempt();
    expect(attempt.answers).toEqual({ q1: evil });
  });
});

describe("buildCompleteAttemptSql", () => {
  it("виставляє completedAt і дописує питання фінальної відповіді до reached", async () => {
    await upsert(["q1"]);

    await run(buildCompleteAttemptSql("form-1", "session-1", ["q1", "q2", "q3"]));

    const [attempt] = await readAttempt();
    expect(attempt.completedAt).not.toBeNull();
    expect([...attempt.reachedQuestionIds!].sort()).toEqual(["q1", "q2", "q3"]);
  });

  it("не падає, якщо рядка проходження немає (autosave не встиг спрацювати)", async () => {
    await expect(
      run(buildCompleteAttemptSql("form-1", "missing-session", ["q1"])),
    ).resolves.toBeDefined();
    expect(await readAttempt()).toHaveLength(0);
  });
});

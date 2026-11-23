import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";

// schema.prisma is the source of truth for the code, but a deployment builds the database ONLY from
// prisma/migrations. A model added with `prisma db push` and never migrated works on a developer's
// machine and breaks on a clean database (this happened with RefreshToken). This test applies the
// migrations to an empty database and checks that every table and column of the schema exists.
describe("prisma/migrations match schema.prisma", () => {
  it("create every table and column of every model", async () => {
    const pg = new PGlite();
    const dir = join(import.meta.dirname, "../../prisma/migrations");
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name, "migration.sql");
      if (existsSync(file)) await pg.exec(readFileSync(file, "utf8"));
    }

    const { rows } = await pg.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    const columns = new Map<string, Set<string>>();
    for (const row of rows) {
      columns.set(row.table_name, (columns.get(row.table_name) ?? new Set()).add(row.column_name));
    }

    const missing: string[] = [];
    for (const model of Prisma.dmmf.datamodel.models) {
      const table = model.dbName ?? model.name;
      const have = columns.get(table);

      if (!have) {
        missing.push(`table ${table}`);
        continue;
      }

      for (const field of model.fields) {
        if (field.kind === "object") continue;
        const column = field.dbName ?? field.name;
        if (!have.has(column)) missing.push(`${table}.${column}`);
      }
    }

    expect(missing).toEqual([]);
  });
});

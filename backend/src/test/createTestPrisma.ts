import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Справжній PrismaClient поверх PGlite (Postgres у WASM) з міграціями проєкту -
 * для інтеграційних тестів без docker. Використання:
 *
 *   vi.mock("../../prisma/prisma.js", async () =>
 *     (await import("../../test/createTestPrisma.js")).createTestPrisma());
 *
 * Усе імпортується динамічно, щоб звичайні unit-тести не платили за запуск WASM.
 */
export const createTestPrisma = async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { PrismaPGlite } = await import("pglite-prisma-adapter");
  const { PrismaClient } = await import("@prisma/client");

  const pg = new PGlite();
  const dir = join(import.meta.dirname, "../../prisma/migrations");
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name, "migration.sql");
    if (existsSync(file)) await pg.exec(readFileSync(file, "utf8"));
  }

  return { prisma: new PrismaClient({ adapter: new PrismaPGlite(pg) }) };
};

import "dotenv/config";
import { defineConfig, env } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Neon: DATABASE_URL is the pooled connection (what the app uses), but migrations need the
    // direct one (DIRECT_URL): pgbouncer does not support the advisory locks `migrate deploy` takes.
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
});

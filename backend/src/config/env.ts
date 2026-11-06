import { z } from "zod";

/**
 * Almost every module used to read process.env.X! directly (a non-null assertion): a
 * forgotten variable crashed the app somewhere deep (for example jwt.sign got "undefined" as
 * the secret) with a confusing error instead of failing at startup. This is the single source
 * of truth for which environment variables the app needs at all.
 */
const MIN_PRODUCTION_SECRET_LENGTH = 32;

const envSchema = z
  .object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5001),
  JWT_SECRET: z.string().min(1, "JWT_SECRET є обов'язковим"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL є обов'язковим"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // Number of trusted reverse proxies in front of the backend ("1" for one nginx/Render/Railway)
  // or an Express "trust proxy" value ("loopback", etc.). Without it, behind a proxy req.ip is the
  // proxy's own address, and the rate limit (shared by all users) trips for everyone at once.
  TRUST_PROXY: z.string().optional(),
  // How many days finished exports (file + ExportJob row) are kept.
  EXPORT_RETENTION_DAYS: z.coerce.number().int().min(1).default(7),
  // How many days UNFINISHED sessions (ResponseAttempt) are kept. 0 = never delete. Completed
  // sessions are never deleted: the funnel would lose its completions (see docs/security.md,
  // "Data retention").
  ATTEMPT_RETENTION_DAYS: z.coerce.number().int().min(0).default(180),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;

    if (env.JWT_SECRET.length < MIN_PRODUCTION_SECRET_LENGTH) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: `у production має містити щонайменше ${MIN_PRODUCTION_SECRET_LENGTH} символи (напр. openssl rand -base64 48)`,
      });
    }

    if (/change-?me/i.test(env.JWT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: "у production не можна лишати значення-приклад з .env.example",
      });
    }

    if (/localhost|127\.0\.0\.1/.test(env.CORS_ORIGIN)) {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGIN"],
        message: "у production має бути реальний origin фронтенду, а не localhost",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Full validation of process.env. It is called explicitly from the entry points (server.ts,
 * worker.ts), NOT from app.ts or any module imported by tests: tests set only the variables
 * they really need (for example just JWT_SECRET) and must not fail because DATABASE_URL or
 * other irrelevant variables are missing. If anything is wrong it throws ONE error listing all
 * problems at once, instead of the app failing on each missing variable in turn.
 */
export const validateEnv = (): Env => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Некоректна конфігурація середовища:\n${details}`);
  }

  return result.data;
};

// Targeted getters for individual modules (jwt.ts, prisma.ts, redisConnection.ts). They read
// process.env at CALL time, not at module import, deliberately, so existing tests that set env
// variables in beforeAll/beforeEach BEFORE dynamically importing the module keep working.
export const getJwtSecret = (): string => {
  const value = process.env.JWT_SECRET;
  if (!value) {
    throw new Error("JWT_SECRET не задано в середовищі");
  }
  return value;
};

export const getDatabaseUrl = (): string => {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL не задано в середовищі");
  }
  return value;
};

export const getRedisUrl = (): string => process.env.REDIS_URL ?? "redis://localhost:6379";

// Turns TRUST_PROXY into a value for app.set("trust proxy", ...): a hop count ("1"),
// true/false or an Express preset string ("loopback").
export const parseTrustProxy = (value: string | undefined): boolean | number | string => {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
};

export const isProduction = (): boolean => process.env.NODE_ENV === "production";

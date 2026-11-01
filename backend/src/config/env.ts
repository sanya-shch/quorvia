import { z } from "zod";

/**
 * Раніше майже кожен модуль читав process.env.X! напряму (non-null
 * assertion) - якщо змінну забути виставити, застосунок падав десь
 * углибині коду (наприклад, jwt.sign отримував "undefined" як секрет) із
 * незрозумілою помилкою, а не одразу при старті. Тут - єдине джерело
 * правди для того, які змінні середовища взагалі потрібні застосунку.
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
  // Кількість довірених reverse proxy перед бекендом ("1" для одного nginx/
  // Render/Railway) або значення Express "trust proxy" ("loopback" тощо).
  // Без цього за проксі req.ip - адреса самого проксі, і rate limit
  // (однаковий для всіх користувачів) спрацьовує на всіх одразу.
  TRUST_PROXY: z.string().optional(),
  // Скільки днів зберігаються готові експорти (файл + запис ExportJob).
  EXPORT_RETENTION_DAYS: z.coerce.number().int().min(1).default(7),
  // Скільки днів зберігаються НЕзавершені проходження (ResponseAttempt).
  // 0 = не видаляти. Завершені проходження не видаляються ніколи: без них
  // funnel втратив би завершення (див. README, "Data retention").
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
 * Повна валідація process.env - викликається явно з точок входу
 * (server.ts, worker.ts), а НЕ з app.ts чи будь-якого модуля, що
 * імпортується тестами: тести виставляють лише ті змінні, які їм
 * реально потрібні (наприклад, лише JWT_SECRET), і не повинні падати
 * через відсутність DATABASE_URL чи інших несуттєвих для конкретного
 * тесту змінних. Якщо щось не так - кидає ОДНУ помилку з повним списком
 * усіх проблем одразу, замість того, щоб застосунок падав по черзі на
 * кожній відсутній змінній.
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

/**
 * Точкові гетери для окремих модулів (jwt.ts, prisma.ts,
 * redisConnection.ts). Читають process.env у момент ВИКЛИКУ, а не при
 * імпорті модуля - це свідомо, щоб не ламати наявні тести, які
 * встановлюють env-змінні в beforeAll/beforeEach ПЕРЕД динамічним
 * імпортом модуля, що їх використовує.
 */
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

/**
 * Перетворює TRUST_PROXY на значення для app.set("trust proxy", ...):
 * число хопів ("1"), true/false або рядок-пресет Express ("loopback").
 */
export const parseTrustProxy = (value: string | undefined): boolean | number | string => {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
};

export const isProduction = (): boolean => process.env.NODE_ENV === "production";

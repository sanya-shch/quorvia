import { describe, expect, it } from "vitest";
import { parseTrustProxy, validateEnv } from "./env.js";

const withEnv = (vars: Record<string, string | undefined>, fn: () => void) => {
  const saved = { ...process.env };
  for (const key of ["NODE_ENV", "JWT_SECRET", "DATABASE_URL", "CORS_ORIGIN", "TRUST_PROXY", "EXPORT_RETENTION_DAYS", "ATTEMPT_RETENTION_DAYS"]) {
    delete process.env[key];
  }
  Object.assign(process.env, vars);
  try {
    fn();
  } finally {
    process.env = saved;
  }
};

const base = { DATABASE_URL: "postgresql://x", JWT_SECRET: "dev" };
const prod = {
  ...base,
  NODE_ENV: "production",
  JWT_SECRET: "a".repeat(40),
  CORS_ORIGIN: "https://app.example.com",
};

describe("validateEnv", () => {
  it("у development короткий секрет дозволено", () => {
    withEnv(base, () => expect(validateEnv().JWT_SECRET).toBe("dev"));
  });

  it("у production приймає сильний секрет і реальний CORS_ORIGIN", () => {
    withEnv(prod, () => expect(validateEnv().NODE_ENV).toBe("production"));
  });

  it("у production відхиляє секрет коротший за 32 символи", () => {
    withEnv({ ...prod, JWT_SECRET: "short" }, () => expect(() => validateEnv()).toThrow(/JWT_SECRET/));
  });

  it("у production відхиляє значення-приклад з .env.example", () => {
    withEnv({ ...prod, JWT_SECRET: "change-me-in-production-change-me-in-production" }, () =>
      expect(() => validateEnv()).toThrow(/JWT_SECRET/),
    );
  });

  it("у production відхиляє localhost у CORS_ORIGIN", () => {
    withEnv({ ...prod, CORS_ORIGIN: "http://localhost:5173" }, () =>
      expect(() => validateEnv()).toThrow(/CORS_ORIGIN/),
    );
  });
});

describe("parseTrustProxy", () => {
  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["true", true],
    ["1", 1],
    ["loopback", "loopback"],
  ])("%j -> %j", (input, expected) => {
    expect(parseTrustProxy(input as string | undefined)).toBe(expected);
  });
});

describe("validateEnv - retention", () => {
  it("за замовчуванням: експорти 7 днів, незавершені проходження 180 днів", () => {
    withEnv(base, () => {
      const env = validateEnv();
      expect(env.EXPORT_RETENTION_DAYS).toBe(7);
      expect(env.ATTEMPT_RETENTION_DAYS).toBe(180);
    });
  });

  it("читає значення зі змінних середовища (рядки -> числа)", () => {
    withEnv({ ...base, EXPORT_RETENTION_DAYS: "30", ATTEMPT_RETENTION_DAYS: "365" }, () => {
      const env = validateEnv();
      expect(env.EXPORT_RETENTION_DAYS).toBe(30);
      expect(env.ATTEMPT_RETENTION_DAYS).toBe(365);
    });
  });

  it("ATTEMPT_RETENTION_DAYS=0 дозволено - це \"не видаляти\"", () => {
    withEnv({ ...base, ATTEMPT_RETENTION_DAYS: "0" }, () =>
      expect(validateEnv().ATTEMPT_RETENTION_DAYS).toBe(0),
    );
  });

  it("EXPORT_RETENTION_DAYS=0 відхиляється (негайне видалення зламало б завантаження)", () => {
    withEnv({ ...base, EXPORT_RETENTION_DAYS: "0" }, () =>
      expect(() => validateEnv()).toThrow(/EXPORT_RETENTION_DAYS/),
    );
  });

  it("відхиляє від'ємні й нечислові значення", () => {
    withEnv({ ...base, ATTEMPT_RETENTION_DAYS: "-5" }, () =>
      expect(() => validateEnv()).toThrow(/ATTEMPT_RETENTION_DAYS/),
    );
    withEnv({ ...base, EXPORT_RETENTION_DAYS: "soon" }, () =>
      expect(() => validateEnv()).toThrow(/EXPORT_RETENTION_DAYS/),
    );
  });
});

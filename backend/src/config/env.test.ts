import { describe, expect, it } from "vitest";
import { parseTrustProxy, validateEnv } from "./env.js";

const withEnv = (vars: Record<string, string | undefined>, fn: () => void) => {
  const saved = { ...process.env };
  for (const key of ["NODE_ENV", "JWT_SECRET", "DATABASE_URL", "CORS_ORIGIN", "TRUST_PROXY"]) {
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

import { beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";

const TEST_SECRET = "test-secret-for-vitest";

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

describe("generateAccessToken / generateToken", () => {
  it("генерує токен, який верифікується тим самим секретом і містить payload", async () => {
    const { generateToken } = await import("./jwt.js");

    const token = generateToken({ userId: "user-1" });
    const decoded = jwt.verify(token, TEST_SECRET) as { userId: string };

    expect(decoded.userId).toBe("user-1");
  });

  it("токен спливає через 15 хвилин (900с)", async () => {
    const { generateToken } = await import("./jwt.js");

    const token = generateToken({ userId: "user-1" });
    const decoded = jwt.decode(token) as { iat: number; exp: number };

    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });

  it("токен, підписаний іншим секретом, не верифікується", async () => {
    const { generateToken } = await import("./jwt.js");

    const token = generateToken({ userId: "user-1" });

    expect(() => jwt.verify(token, "wrong-secret")).toThrow();
  });

  it("generateAccessToken і generateToken - одна й та сама функція", async () => {
    const { generateAccessToken, generateToken } = await import("./jwt.js");

    expect(generateAccessToken).toBe(generateToken);
  });
});

describe("verifyAccessToken", () => {
  it("повертає payload дійсного токена", async () => {
    const { generateToken, verifyAccessToken } = await import("./jwt.js");

    const token = generateToken({ userId: "user-7" });

    expect(verifyAccessToken(token)).toMatchObject({ userId: "user-7" });
  });

  it("кидає помилку для токена з чужим секретом", async () => {
    const { verifyAccessToken } = await import("./jwt.js");
    const foreignToken = jwt.sign({ userId: "user-1" }, "wrong-secret");

    expect(() => verifyAccessToken(foreignToken)).toThrow();
  });
});

describe("generateRefreshToken / hashRefreshToken", () => {
  it("повертає сирий токен, його SHA-256 хеш і дату спливу в майбутньому", async () => {
    const { generateRefreshToken, hashRefreshToken } = await import("./jwt.js");

    const { token, tokenHash, expiresAt } = generateRefreshToken();

    expect(token).toMatch(/^[0-9a-f]+$/);
    expect(tokenHash).toBe(hashRefreshToken(token));
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("кожен виклик генерує унікальний токен", async () => {
    const { generateRefreshToken } = await import("./jwt.js");

    const first = generateRefreshToken();
    const second = generateRefreshToken();

    expect(first.token).not.toBe(second.token);
  });

  it("hashRefreshToken - детермінований (однаковий токен -> однаковий хеш)", async () => {
    const { hashRefreshToken } = await import("./jwt.js");

    expect(hashRefreshToken("abc")).toBe(hashRefreshToken("abc"));
    expect(hashRefreshToken("abc")).not.toBe(hashRefreshToken("abd"));
  });
});

describe("фіксований алгоритм підпису (HS256)", () => {
  it("токен підписується HS256", async () => {
    const { generateAccessToken } = await import("./jwt.js");
    const token = generateAccessToken({ userId: "user-1" });
    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());

    expect(header.alg).toBe("HS256");
  });

  it("verifyAccessToken відхиляє токен з іншим алгоритмом (HS512) навіть із правильним секретом", async () => {
    const { verifyAccessToken } = await import("./jwt.js");
    const forged = jwt.sign({ userId: "user-1" }, TEST_SECRET, { algorithm: "HS512" });

    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('verifyAccessToken відхиляє непідписаний токен (alg: "none")', async () => {
    const { verifyAccessToken } = await import("./jwt.js");
    const encode = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${encode({ alg: "none", typ: "JWT" })}.${encode({ userId: "user-1" })}.`;

    expect(() => verifyAccessToken(unsigned)).toThrow();
  });
});

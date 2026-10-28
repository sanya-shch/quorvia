import { beforeEach, describe, expect, it, vi } from "vitest";
const { Prisma } = await import("@prisma/client");

const { prisma } = await import("../../prisma/prisma.js");
const bcrypt = (await import("bcrypt")).default;
const { ErrorCode } = await import("@surveycraft/shared-types");
const { generateAccessToken, generateRefreshToken, hashRefreshToken } =
  await import("../../shared/utils/jwt.js");
const { cleanupRefreshTokens, loginHandler, refreshAccessToken, registerUser, revokeRefreshToken } =
  await import("./auth.service.js");

vi.mock("../../prisma/prisma.js", () => ({
  prisma: {
    user: { create: vi.fn(), findUnique: vi.fn() },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

// Реальний @prisma/client тут не потрібен (і в цьому середовищі клієнт
// взагалі не згенерований) - мокаємо лише мінімальний клас помилки, який
// production-код перевіряє через `instanceof Prisma.PrismaClientKnownRequestError`.
vi.mock("@prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, options: { code: string }) {
      super(message);
      this.code = options.code;
    }
  }

  return { Prisma: { PrismaClientKnownRequestError } };
});

vi.mock("bcrypt", () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
}));

vi.mock("../../shared/utils/jwt.js", () => ({
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  hashRefreshToken: vi.fn((token: string) => `hashed-${token}`),
}));

const REFRESH_EXPIRES_AT = new Date("2099-01-01T00:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret";
  (generateAccessToken as any).mockReturnValue("access-token");
  (generateRefreshToken as any).mockReturnValue({
    token: "raw-refresh-token",
    tokenHash: "hashed-raw-refresh-token",
    expiresAt: REFRESH_EXPIRES_AT,
  });
});

describe("registerUser", () => {
  it("хешує пароль, зберігає хеш refresh-токена і повертає обидва токени + користувача без password", async () => {
    (bcrypt.hash as any).mockResolvedValue("hashed-pw");
    (prisma.user.create as any).mockResolvedValue({
      id: "user-1",
      email: "a@b.com",
      password: "hashed-pw",
    });

    const result = await registerUser("a@b.com", "plain-password");

    expect(bcrypt.hash).toHaveBeenCalledWith("plain-password", 10);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: "a@b.com", password: "hashed-pw" },
    });
    expect(generateAccessToken).toHaveBeenCalledWith({ userId: "user-1" });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        tokenHash: "hashed-raw-refresh-token",
        userId: "user-1",
        expiresAt: REFRESH_EXPIRES_AT,
      },
    });
    expect(result).toEqual({
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
      refreshTokenExpiresAt: REFRESH_EXPIRES_AT,
      user: { id: "user-1", email: "a@b.com" },
    });
    expect(result.user).not.toHaveProperty("password");
  });

  it('кидає 409 "Email already in use", якщо email вже зайнятий (P2002), і НЕ видає токени', async () => {
    (bcrypt.hash as any).mockResolvedValue("hashed-pw");
    (prisma.user.create as any).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`email`)",
        {
          code: "P2002",
        },
      ),
    );

    await expect(registerUser("a@b.com", "plain-password")).rejects.toMatchObject({
      statusCode: 409,
      message: ErrorCode.AUTH_EMAIL_ALREADY_IN_USE,
    });
    expect(generateAccessToken).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it("прокидає далі помилки, не пов'язані з унікальністю email", async () => {
    (bcrypt.hash as any).mockResolvedValue("hashed-pw");
    const dbDown = new Error("connection refused");
    (prisma.user.create as any).mockRejectedValue(dbDown);

    await expect(registerUser("a@b.com", "plain-password")).rejects.toBe(dbDown);
  });
});

describe("loginHandler", () => {
  it('кидає 401 "Invalid credentials", якщо користувача з таким email не існує', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);

    await expect(loginHandler("nobody@b.com", "pw")).rejects.toMatchObject({
      statusCode: 401,
      message: ErrorCode.AUTH_INVALID_CREDENTIALS,
    });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("кидає 401, якщо пароль не збігається (не витікає, чи існує email)", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "user-1",
      email: "a@b.com",
      password: "hashed-pw",
    });
    (bcrypt.compare as any).mockResolvedValue(false);

    await expect(loginHandler("a@b.com", "wrong-pw")).rejects.toMatchObject({
      statusCode: 401,
      message: ErrorCode.AUTH_INVALID_CREDENTIALS,
    });
  });

  it("повертає ту саму пару токенів, що й реєстрація (єдине джерело TTL), і користувача без password", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "user-1",
      email: "a@b.com",
      password: "hashed-pw",
    });
    (bcrypt.compare as any).mockResolvedValue(true);

    const result = await loginHandler("a@b.com", "correct-pw");

    expect(bcrypt.compare).toHaveBeenCalledWith("correct-pw", "hashed-pw");
    expect(generateAccessToken).toHaveBeenCalledWith({ userId: "user-1" });
    expect(result).toEqual({
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
      refreshTokenExpiresAt: REFRESH_EXPIRES_AT,
      user: { id: "user-1", email: "a@b.com" },
    });
  });
});

describe("refreshAccessToken", () => {
  it("кидає 401, якщо refresh-токен не передано", async () => {
    await expect(refreshAccessToken(undefined)).rejects.toMatchObject({ statusCode: 401 });
    expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it("кидає 401, якщо токена немає в БД", async () => {
    (prisma.refreshToken.findUnique as any).mockResolvedValue(null);

    await expect(refreshAccessToken("some-token")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("кидає 401 для вже відкликаного токена", async () => {
    (prisma.refreshToken.findUnique as any).mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      revokedAt: new Date(),
      expiresAt: REFRESH_EXPIRES_AT,
    });

    await expect(refreshAccessToken("some-token")).rejects.toMatchObject({ statusCode: 401 });
    expect(prisma.refreshToken.update).not.toHaveBeenCalled();
  });

  it("свіжа гонка (відкликано щойно) - 401, але сесії користувача НЕ вбиваємо", async () => {
    (prisma.refreshToken.findUnique as any).mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      revokedAt: new Date(Date.now() - 1_000),
      expiresAt: REFRESH_EXPIRES_AT,
    });

    await expect(refreshAccessToken("some-token")).rejects.toMatchObject({ statusCode: 401 });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("reuse detection: давно відкликаний токен пред'явлено знову - відкликає ВСІ токени користувача", async () => {
    (prisma.refreshToken.findUnique as any).mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      revokedAt: new Date(Date.now() - 60_000),
      expiresAt: REFRESH_EXPIRES_AT,
    });

    await expect(refreshAccessToken("stolen-token")).rejects.toMatchObject({ statusCode: 401 });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it("програє гонку: updateMany зачепив 0 рядків - 401 і нова пара не видається", async () => {
    (prisma.refreshToken.findUnique as any).mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      revokedAt: null,
      expiresAt: REFRESH_EXPIRES_AT,
    });
    (prisma.refreshToken.updateMany as any).mockResolvedValue({ count: 0 });

    await expect(refreshAccessToken("some-token")).rejects.toMatchObject({ statusCode: 401 });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it("кидає 401 для протухлого токена", async () => {
    (prisma.refreshToken.findUnique as any).mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      revokedAt: null,
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    });

    await expect(refreshAccessToken("some-token")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("відкликає старий токен і видає нову пару (ротація)", async () => {
    (prisma.refreshToken.findUnique as any).mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      revokedAt: null,
      expiresAt: REFRESH_EXPIRES_AT,
    });

    (prisma.refreshToken.updateMany as any).mockResolvedValue({ count: 1 });

    const result = await refreshAccessToken("old-raw-token");

    expect(hashRefreshToken).toHaveBeenCalledWith("old-raw-token");
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "rt-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        tokenHash: "hashed-raw-refresh-token",
        userId: "user-1",
        expiresAt: REFRESH_EXPIRES_AT,
      },
    });
    expect(result).toEqual({
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
      refreshTokenExpiresAt: REFRESH_EXPIRES_AT,
    });
  });
});

describe("revokeRefreshToken", () => {
  it("нічого не робить, якщо токен не передано", async () => {
    await revokeRefreshToken(undefined);

    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("позначає токен відкликаним за його хешем", async () => {
    await revokeRefreshToken("raw-token");

    expect(hashRefreshToken).toHaveBeenCalledWith("raw-token");
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: "hashed-raw-token", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe("cleanupRefreshTokens", () => {
  it("видаляє токени, прострочені або відкликані понад 7 днів тому", async () => {
    (prisma.refreshToken.deleteMany as any).mockResolvedValue({ count: 3 });
    const now = new Date("2026-10-28T00:00:00.000Z");

    const removed = await cleanupRefreshTokens(now);

    const threshold = new Date("2026-10-21T00:00:00.000Z");
    expect(removed).toBe(3);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ expiresAt: { lt: threshold } }, { revokedAt: { lt: threshold } }] },
    });
  });
});

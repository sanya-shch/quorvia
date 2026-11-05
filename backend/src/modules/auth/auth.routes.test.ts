import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { buildTestApp, makeAuthHeader, TEST_JWT_SECRET } from "../../test/testApp.js";
import { AppError } from "../../shared/middleware/errorHandler.js";

vi.mock("./auth.service.js", () => ({
  registerUser: vi.fn(),
  loginHandler: vi.fn(),
  refreshAccessToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
}));

vi.mock("../../prisma/prisma.js", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

const { registerUser, loginHandler, refreshAccessToken, revokeRefreshToken } = await import(
  "./auth.service.js"
);
const { prisma } = await import("../../prisma/prisma.js");
const authRouter = (await import("./auth.routes.js")).default;

const app = buildTestApp(authRouter, "/api/auth");

const STRONG_PASSWORD = "Str0ngPass";
const TOKEN_PAIR = {
  accessToken: "jwt-access-token",
  refreshToken: "raw-refresh-token",
  refreshTokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
};

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/register", () => {
  it("400, якщо тіло не проходить registerSchema (invalid email)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: STRONG_PASSWORD });

    expect(res.status).toBe(400);
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("400, якщо пароль не задовольняє політику складності", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.com", password: "alllowercase" });

    expect(res.status).toBe(400);
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("200, accessToken у тілі та refreshToken лише в httpOnly cookie", async () => {
    (registerUser as any).mockResolvedValue({
      ...TOKEN_PAIR,
      user: { id: "user-1", email: "a@b.com" },
    });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.com", password: STRONG_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      accessToken: "jwt-access-token",
      user: { id: "user-1", email: "a@b.com" },
    });
    expect(JSON.stringify(res.body)).not.toContain("raw-refresh-token");

    const setCookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(setCookie).toContain("refreshToken=raw-refresh-token");
    expect(setCookie.toLowerCase()).toContain("httponly");

    expect(registerUser).toHaveBeenCalledWith("a@b.com", STRONG_PASSWORD);
  });

  it("пропускає помилку сервісу через errorHandler (напр. email вже зайнятий)", async () => {
    (registerUser as any).mockRejectedValue(new AppError("Email already in use", 409));

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.com", password: STRONG_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "Email already in use", errors: null });
  });
});

describe("POST /api/auth/login", () => {
  it("400 для невалідного тіла", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "x" });

    expect(res.status).toBe(400);
    expect(loginHandler).not.toHaveBeenCalled();
  });

  it("401 при невірних кредах (AppError з сервісу коректно конвертується errorHandler-ом)", async () => {
    (loginHandler as any).mockRejectedValue(new AppError("Invalid credentials", 401));

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@b.com", password: "wrong1" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("200, accessToken у тілі для правильних кредів", async () => {
    (loginHandler as any).mockResolvedValue({
      ...TOKEN_PAIR,
      user: { id: "user-1", email: "a@b.com" },
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@b.com", password: "correct1" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("jwt-access-token");
  });
});

describe("POST /api/auth/refresh", () => {
  it("401, якщо refresh-cookie відсутня (сервіс кидає AppError)", async () => {
    (refreshAccessToken as any).mockRejectedValue(new AppError("Refresh token is missing", 401));

    const res = await request(app).post("/api/auth/refresh");

    expect(res.status).toBe(401);
    expect(refreshAccessToken).toHaveBeenCalledWith(undefined);
  });

  it("200 і новий accessToken + ротована refresh-cookie при дійсній cookie", async () => {
    (refreshAccessToken as any).mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-raw-refresh-token",
      refreshTokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
      user: { id: "user-1", email: "a@b.com" },
    });

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", ["refreshToken=old-raw-refresh-token"]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      accessToken: "new-access-token",
      user: { id: "user-1", email: "a@b.com" },
    });
    expect(JSON.stringify(res.body)).not.toContain("new-raw-refresh-token");
    expect(refreshAccessToken).toHaveBeenCalledWith("old-raw-refresh-token");

    const setCookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(setCookie).toContain("refreshToken=new-raw-refresh-token");
  });
});

describe("GET /api/auth/me", () => {
  it("401 без Authorization заголовка", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
  });

  it("401 для протухлого/невалідного токена", async () => {
    const foreignToken = jwt.sign({ userId: "user-1" }, "wrong-secret");

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${foreignToken}`);

    expect(res.status).toBe(401);
  });

  it("404, якщо користувача з токена вже не існує в БД", async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", makeAuthHeader("user-1"));

    expect(res.status).toBe(404);
  });

  it("200 з даними користувача для валідного токена", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "user-1",
      email: "a@b.com",
    });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", makeAuthHeader("user-1"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "user-1", email: "a@b.com" });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { id: true, email: true },
    });
  });
});

describe("POST /api/auth/logout", () => {
  it("200, відкликає refresh-токен із cookie (якщо є) і очищає cookie", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", ["refreshToken=raw-refresh-token"]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(revokeRefreshToken).toHaveBeenCalledWith("raw-refresh-token");

    const setCookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(setCookie).toMatch(/refreshToken=;/);
  });

  it("200 навіть без cookie (без активної сесії)", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(200);
    expect(revokeRefreshToken).toHaveBeenCalledWith(undefined);
  });
});

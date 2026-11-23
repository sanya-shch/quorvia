import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ErrorCode } from "@quorvia/shared-types";

// The whole app in portfolio mode: the features the free host cannot run answer 403 and the export
// module (BullMQ + a Redis connection opened on import) is never loaded.
vi.mock("./prisma/prisma.js", () => ({ prisma: {} }));
vi.mock("./shared/queue/redisConnection.js", () => {
  throw new Error("Redis must not be loaded in portfolio mode");
});

beforeAll(() => {
  process.env.IS_FOR_PORTFOLIO = "true";
  process.env.JWT_SECRET = "test-secret-for-vitest";
});

afterAll(() => {
  delete process.env.IS_FOR_PORTFOLIO;
});

describe("app in portfolio mode", () => {
  it("answers the health check without touching the database", async () => {
    const { default: app } = await import("./app.js");

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it.each([
    ["POST", "/api/forms/f1/export"],
    ["GET", "/api/forms/f1/export/j1/download"],
    ["POST", "/api/forms/f1/assets"],
    ["POST", "/api/forms/share-1/files"],
  ])("%s %s: 403 FEATURE_DISABLED, before any authentication", async (method, url) => {
    const { default: app } = await import("./app.js");

    const res = await request(app)[method.toLowerCase() as "get" | "post"](url);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(ErrorCode.FEATURE_DISABLED);
  });

  it("closes open registration", async () => {
    const { default: app } = await import("./app.js");

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.com", password: "Str0ngPass" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(ErrorCode.REGISTRATION_DISABLED);
  });
});

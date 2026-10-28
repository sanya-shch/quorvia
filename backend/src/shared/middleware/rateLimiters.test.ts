import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createSubmitResponseLimiter } from "./rateLimiters.js";

const buildApp = (limit: number) => {
  const app = express();
  app.post("/:shareId/responses", createSubmitResponseLimiter(limit), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
};

describe("createSubmitResponseLimiter", () => {
  it("після перевищення ліміту повертає 429 із кодом RATE_LIMITED", async () => {
    const app = buildApp(2);

    await request(app).post("/form-a/responses").expect(200);
    await request(app).post("/form-a/responses").expect(200);
    const res = await request(app).post("/form-a/responses").expect(429);

    expect(res.body).toEqual({ message: "RATE_LIMITED" });
  });

  it("ліміт рахується окремо для кожної форми (shareId)", async () => {
    const app = buildApp(1);

    await request(app).post("/form-a/responses").expect(200);
    await request(app).post("/form-b/responses").expect(200);
    await request(app).post("/form-a/responses").expect(429);
  });
});

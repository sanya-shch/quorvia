import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildTestApp } from "../../test/testApp.js";
import { AppError } from "../../shared/middleware/errorHandler.js";

vi.mock("./attempt.service.js", () => ({
  saveAttempt: vi.fn(),
}));

const { saveAttempt } = await import("./attempt.service.js");
const attemptRouter = (await import("./attempt.routes.js")).default;

const app = buildTestApp(attemptRouter, "/api/public-forms");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PUT /api/public-forms/:shareId/attempt", () => {
  it("400, якщо sessionKey відсутній", async () => {
    const res = await request(app).put("/api/public-forms/share-1/attempt").send({ answers: {} });

    expect(res.status).toBe(400);
    expect(saveAttempt).not.toHaveBeenCalled();
  });

  it("не потребує автентифікації (публічний ендпоінт, як і /responses)", async () => {
    (saveAttempt as any).mockResolvedValue({ id: "attempt-1", updatedAt: new Date("2026-01-01") });

    const res = await request(app)
      .put("/api/public-forms/share-1/attempt")
      .send({ sessionKey: "session-abc", answers: { "q-1": "ok" } });

    expect(res.status).toBe(200);
    expect(saveAttempt).toHaveBeenCalledWith("share-1", "session-abc", { "q-1": "ok" }, undefined);
  });

  it("передає reachedQuestionIds від клієнта в сервіс", async () => {
    (saveAttempt as any).mockResolvedValue({ id: "attempt-1", updatedAt: new Date() });

    const res = await request(app)
      .put("/api/public-forms/share-1/attempt")
      .send({ sessionKey: "session-abc", answers: {}, reachedQuestionIds: ["q-1", "q-2"] });

    expect(res.status).toBe(200);
    expect(saveAttempt).toHaveBeenCalledWith("share-1", "session-abc", {}, ["q-1", "q-2"]);
  });

  it("400 для reachedQuestionIds неправильного типу", async () => {
    const res = await request(app)
      .put("/api/public-forms/share-1/attempt")
      .send({ sessionKey: "session-abc", answers: {}, reachedQuestionIds: "q-1" });

    expect(res.status).toBe(400);
    expect(saveAttempt).not.toHaveBeenCalled();
  });

  it("порожні answers валідні (autosave до будь-якого вводу)", async () => {
    (saveAttempt as any).mockResolvedValue({ id: "attempt-1", updatedAt: new Date() });

    const res = await request(app)
      .put("/api/public-forms/share-1/attempt")
      .send({ sessionKey: "session-abc", answers: {} });

    expect(res.status).toBe(200);
  });

  it("404, якщо форма не існує/не опублікована", async () => {
    (saveAttempt as any).mockRejectedValue(new AppError("Form not found", 404));

    const res = await request(app)
      .put("/api/public-forms/share-1/attempt")
      .send({ sessionKey: "session-abc", answers: {} });

    expect(res.status).toBe(404);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildTestApp } from "../../test/testApp.js";
import { AppError } from "../../shared/middleware/errorHandler.js";

vi.mock("./response.service.js", () => ({
  submitResponse: vi.fn(),
}));

const { submitResponse } = await import("./response.service.js");
const responseRouter = (await import("./response.routes.js")).default;

const app = buildTestApp(responseRouter, "/api/public-forms");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/public-forms/:shareId/responses", () => {
  it("400, якщо answers відсутній або невалідної форми", async () => {
    const res = await request(app)
      .post("/api/public-forms/share-1/responses")
      .send({ answers: "not-an-object" });

    expect(res.status).toBe(400);
    expect(submitResponse).not.toHaveBeenCalled();
  });

  it("не потребує автентифікації (публічний ендпоінт)", async () => {
    (submitResponse as any).mockResolvedValue({
      id: "resp-1",
      createdAt: new Date("2026-01-01"),
    });

    const res = await request(app)
      .post("/api/public-forms/share-1/responses")
      .send({ answers: { "q-1": "ok" } });

    expect(res.status).toBe(200);
    expect(submitResponse).toHaveBeenCalledWith("share-1", { "q-1": "ok" }, undefined, undefined);
  });

  it("повертає лише id/createdAt, не весь об'єкт відповіді", async () => {
    (submitResponse as any).mockResolvedValue({
      id: "resp-1",
      formId: "form-1",
      answers: { secret: "internal" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await request(app)
      .post("/api/public-forms/share-1/responses")
      .send({ answers: {} });

    expect(res.body).toEqual({
      id: "resp-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(res.body).not.toHaveProperty("answers");
  });

  it("404, якщо форма не існує/не опублікована (пропускається через next(err))", async () => {
    (submitResponse as any).mockRejectedValue(new AppError("Form not found", 404));

    const res = await request(app)
      .post("/api/public-forms/share-1/responses")
      .send({ answers: {} });

    expect(res.status).toBe(404);
  });

  it("400 з деталями помилок валідації відповідей форми", async () => {
    (submitResponse as any).mockRejectedValue(
      new AppError("Validation failed", 400, [{ field: "q-1", message: "Required" }]),
    );

    const res = await request(app)
      .post("/api/public-forms/share-1/responses")
      .send({ answers: {} });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: "q-1", message: "Required" }]);
  });
});

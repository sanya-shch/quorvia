import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildTestApp, makeAuthHeader, TEST_JWT_SECRET } from "../../test/testApp.js";
import { AppError } from "../../shared/middleware/errorHandler.js";

vi.mock("./form.service.js", () => ({
  createForm: vi.fn(),
  getUserForms: vi.fn(),
  deleteForm: vi.fn(),
  getUserForm: vi.fn(),
  getPublicForm: vi.fn(),
  updateForm: vi.fn(),
  publishForm: vi.fn(),
  unpublishForm: vi.fn(),
  duplicateForm: vi.fn(),
}));

const service = await import("./form.service.js");
const formRouter = (await import("./form.routes.js")).default;

const app = buildTestApp(formRouter, "/api/forms");
const AUTH = makeAuthHeader("user-1");

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/forms", () => {
  it("401 без токена", async () => {
    const res = await request(app).post("/api/forms").send({ title: "Форма" });
    expect(res.status).toBe(401);
    expect(service.createForm).not.toHaveBeenCalled();
  });

  it("200 і викликає createForm з title/description/userId з токена", async () => {
    (service.createForm as any).mockResolvedValue({ id: "form-1" });

    const res = await request(app)
      .post("/api/forms")
      .set("Authorization", AUTH)
      .send({ title: "Нова форма", description: "опис" });

    expect(res.status).toBe(200);
    expect(service.createForm).toHaveBeenCalledWith({
      title: "Нова форма",
      description: "опис",
      userId: "user-1",
    });
  });
});

describe("GET /api/forms", () => {
  it("401 без токена, 200 зі списком форм із токеном", async () => {
    const unauth = await request(app).get("/api/forms");
    expect(unauth.status).toBe(401);

    (service.getUserForms as any).mockResolvedValue([{ id: "form-1" }]);
    const res = await request(app).get("/api/forms").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "form-1" }]);
    expect(service.getUserForms).toHaveBeenCalledWith("user-1");
  });
});

describe("DELETE /api/forms/:formId", () => {
  it("404, коли сервіс кидає AppError (форма не знайдена)", async () => {
    (service.deleteForm as any).mockRejectedValue(new AppError("Form not found", 404));

    const res = await request(app).delete("/api/forms/form-1").set("Authorization", AUTH);

    expect(res.status).toBe(404);
  });

  it("200 { success: true } при успішному видаленні", async () => {
    (service.deleteForm as any).mockResolvedValue(undefined);

    const res = await request(app).delete("/api/forms/form-1").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(service.deleteForm).toHaveBeenCalledWith("form-1", "user-1");
  });
});

describe("GET /api/forms/:formId/admin", () => {
  it("403, коли сервіс кидає Forbidden", async () => {
    (service.getUserForm as any).mockRejectedValue(new AppError("Forbidden", 403));

    const res = await request(app).get("/api/forms/form-1/admin").set("Authorization", AUTH);

    expect(res.status).toBe(403);
  });

  it("200 з формою для власника", async () => {
    (service.getUserForm as any).mockResolvedValue({ id: "form-1", questions: [] });

    const res = await request(app).get("/api/forms/form-1/admin").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(service.getUserForm).toHaveBeenCalledWith("form-1", "user-1");
  });
});

describe("PATCH /api/forms/:formId", () => {
  it("400, якщо questions не проходять валідацію (наприклад CHOICE_SINGLE без options)", async () => {
    const res = await request(app)
      .patch("/api/forms/form-1")
      .set("Authorization", AUTH)
      .send({
        title: "Форма",
        questions: [{ type: "CHOICE_SINGLE", text: "Колір", order: 0, options: [] }],
      });

    expect(res.status).toBe(400);
    expect(service.updateForm).not.toHaveBeenCalled();
  });

  it("200 і передає розпарсене тіло у updateForm", async () => {
    (service.updateForm as any).mockResolvedValue({ success: true });

    const res = await request(app)
      .patch("/api/forms/form-1")
      .set("Authorization", AUTH)
      .send({ title: "Форма", questions: [] });

    expect(res.status).toBe(200);
    expect(service.updateForm).toHaveBeenCalledWith(
      "form-1",
      "user-1",
      expect.objectContaining({ title: "Форма", questions: [] }),
    );
  });
});

describe("GET /api/forms/public/:shareId", () => {
  it("не потребує автентифікації", async () => {
    (service.getPublicForm as any).mockResolvedValue({ id: "form-1" });

    const res = await request(app).get("/api/forms/public/share-1");

    expect(res.status).toBe(200);
    expect(service.getPublicForm).toHaveBeenCalledWith("share-1");
  });

  it("404, якщо форма неопублікована/не існує", async () => {
    (service.getPublicForm as any).mockRejectedValue(new AppError("Form not available", 404));

    const res = await request(app).get("/api/forms/public/share-1");

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/forms/:formId/publish та /unpublish", () => {
  it("publish: 401 без токена, 200 з токеном", async () => {
    const unauth = await request(app).patch("/api/forms/form-1/publish");
    expect(unauth.status).toBe(401);

    (service.publishForm as any).mockResolvedValue({});
    const res = await request(app).patch("/api/forms/form-1/publish").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(service.publishForm).toHaveBeenCalledWith("form-1", "user-1");
  });

  it("unpublish: 403, коли сервіс кидає Forbidden (регресійний тест на фікс ownership-перевірки)", async () => {
    (service.unpublishForm as any).mockRejectedValue(new AppError("Forbidden", 403));

    const res = await request(app).patch("/api/forms/form-1/unpublish").set("Authorization", AUTH);

    expect(res.status).toBe(403);
  });

  it("unpublish: 200 для власника", async () => {
    (service.unpublishForm as any).mockResolvedValue({});

    const res = await request(app).patch("/api/forms/form-1/unpublish").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(service.unpublishForm).toHaveBeenCalledWith("form-1", "user-1");
  });
});

describe("POST /api/forms/:formId/duplicate", () => {
  it("200 і повертає нову форму", async () => {
    (service.duplicateForm as any).mockResolvedValue({ id: "form-2" });

    const res = await request(app).post("/api/forms/form-1/duplicate").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "form-2" });
    expect(service.duplicateForm).toHaveBeenCalledWith("form-1", "user-1");
  });
});

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildTestApp, makeAuthHeader, TEST_JWT_SECRET } from "../../test/testApp.js";
import { AppError } from "../../shared/middleware/errorHandler.js";

vi.mock("./analytics.service.js", () => ({
  getFormAnalytics: vi.fn(),
  getFormPaths: vi.fn(),
  getQuestionAnalytics: vi.fn(),
  getResponses: vi.fn(),
  getResponseById: vi.fn(),
  getFormFunnel: vi.fn(),
  getFormSummary: vi.fn(),
  getFormJourneys: vi.fn(),
}));

const service = await import("./analytics.service.js");
const analyticsRouter = (await import("./analytics.routes.js")).default;

const app = buildTestApp(analyticsRouter, "/api/forms");
const AUTH = makeAuthHeader("user-1");

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/forms/:formId/analytics", () => {
  it("401 без токена", async () => {
    const res = await request(app).get("/api/forms/form-1/analytics");
    expect(res.status).toBe(401);
  });

  it("200 з даними аналітики для власника", async () => {
    (service.getFormAnalytics as any).mockResolvedValue({
      totalResponses: 5,
      questions: [],
    });

    const res = await request(app).get("/api/forms/form-1/analytics").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.totalResponses).toBe(5);
    expect(service.getFormAnalytics).toHaveBeenCalledWith("form-1", "user-1", {});
  });

  it("403, коли форма належить іншому користувачу", async () => {
    (service.getFormAnalytics as any).mockRejectedValue(new AppError("Forbidden", 403));

    const res = await request(app).get("/api/forms/form-1/analytics").set("Authorization", AUTH);

    expect(res.status).toBe(403);
  });
});

describe("GET /api/forms/:formId/analytics/paths", () => {
  it("401 без токена", async () => {
    const res = await request(app).get("/api/forms/form-1/analytics/paths");
    expect(res.status).toBe(401);
  });

  it("200 з nodes/edges і не плутається з /:formId/analytics", async () => {
    (service.getFormPaths as any).mockResolvedValue({
      totalResponses: 3,
      nodes: [{ questionId: "q1", text: "Q1", order: 0, shownCount: 3 }],
      edges: [{ fromQuestionId: null, toQuestionId: "q1", count: 3 }],
    });

    const res = await request(app)
      .get("/api/forms/form-1/analytics/paths")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(1);
    expect(service.getFormPaths).toHaveBeenCalledWith("form-1", "user-1", {});
    // /analytics (without /paths) must not have been called
    expect(service.getFormAnalytics).not.toHaveBeenCalled();
  });
});

describe("GET /api/forms/:formId/questions/:questionId/analytics", () => {
  it("200 і передає formId + questionId у сервіс", async () => {
    (service.getQuestionAnalytics as any).mockResolvedValue({ totalAnswers: 0 });

    const res = await request(app)
      .get("/api/forms/form-1/questions/q-1/analytics")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(service.getQuestionAnalytics).toHaveBeenCalledWith("form-1", "q-1", "user-1", {});
  });
});

describe("GET /api/forms/:formId/responses", () => {
  it("парсить page/limit з query-рядка в числа", async () => {
    (service.getResponses as any).mockResolvedValue({
      total: 0,
      page: 2,
      limit: 5,
      data: [],
    });

    const res = await request(app)
      .get("/api/forms/form-1/responses?page=2&limit=5")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(service.getResponses).toHaveBeenCalledWith("form-1", "user-1", 2, 5);
  });

  it("використовує page=1/limit=10 за замовчуванням, коли query відсутній", async () => {
    (service.getResponses as any).mockResolvedValue({
      total: 0,
      page: 1,
      limit: 10,
      data: [],
    });

    await request(app).get("/api/forms/form-1/responses").set("Authorization", AUTH);

    expect(service.getResponses).toHaveBeenCalledWith("form-1", "user-1", 1, 10);
  });

  it("невалідний (нечисловий) page деградує до дефолтного 1, а не NaN", async () => {
    (service.getResponses as any).mockResolvedValue({
      total: 0,
      page: 1,
      limit: 10,
      data: [],
    });

    await request(app).get("/api/forms/form-1/responses?page=abc").set("Authorization", AUTH);

    expect(service.getResponses).toHaveBeenCalledWith("form-1", "user-1", 1, 10);
  });
});

describe("GET /api/forms/:formId/responses/:responseId", () => {
  it("404, коли відповідь не знайдено", async () => {
    (service.getResponseById as any).mockRejectedValue(new AppError("Response not found", 404));

    const res = await request(app)
      .get("/api/forms/form-1/responses/resp-1")
      .set("Authorization", AUTH);

    expect(res.status).toBe(404);
  });

  it("200 з деталями конкретної відповіді", async () => {
    (service.getResponseById as any).mockResolvedValue({
      id: "resp-1",
      formId: "form-1",
      answers: [],
    });

    const res = await request(app)
      .get("/api/forms/form-1/responses/resp-1")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(service.getResponseById).toHaveBeenCalledWith("form-1", "resp-1", "user-1");
  });
});

describe("GET /api/forms/:formId/analytics/funnel", () => {
  it("401 без токена", async () => {
    const res = await request(app).get("/api/forms/form-1/analytics/funnel");
    expect(res.status).toBe(401);
  });

  it("200 з totalAttempts/totalCompletions/nodes, не плутається з /paths", async () => {
    (service.getFormFunnel as any).mockResolvedValue({
      totalAttempts: 10,
      totalCompletions: 4,
      completionRate: 0.4,
      nodes: [{ questionId: "q1", text: "Q1", order: 0, reachedCount: 10 }],
    });

    const res = await request(app)
      .get("/api/forms/form-1/analytics/funnel")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.totalAttempts).toBe(10);
    expect(res.body.completionRate).toBe(0.4);
    expect(service.getFormFunnel).toHaveBeenCalledWith("form-1", "user-1", {});
    expect(service.getFormPaths).not.toHaveBeenCalled();
  });
});

describe("період у ?from=&to=", () => {
  it("передається в сервіс як Date, голу дату читає як повний день UTC", async () => {
    (service.getFormFunnel as any).mockResolvedValue({ totalAttempts: 0 });

    await request(app)
      .get("/api/forms/form-1/analytics/funnel?from=2026-11-01&to=2026-11-17")
      .set("Authorization", AUTH);

    expect(service.getFormFunnel).toHaveBeenCalledWith("form-1", "user-1", {
      from: new Date("2026-11-01T00:00:00.000Z"),
      to: new Date("2026-11-17T23:59:59.999Z"),
    });
  });

  it("некоректна дата ігнорується, а не дає 500", async () => {
    (service.getFormPaths as any).mockResolvedValue({ nodes: [], edges: [] });

    const res = await request(app)
      .get("/api/forms/form-1/analytics/paths?from=вчора&to=")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(service.getFormPaths).toHaveBeenCalledWith("form-1", "user-1", {});
  });
});

describe("GET /api/forms/:formId/analytics/summary", () => {
  it("401 без токена", async () => {
    const res = await request(app).get("/api/forms/form-1/analytics/summary");
    expect(res.status).toBe(401);
  });

  it("200 і передає період у сервіс", async () => {
    (service.getFormSummary as any).mockResolvedValue({ current: { responses: 3 } });

    const res = await request(app)
      .get("/api/forms/form-1/analytics/summary?from=2026-10-01&to=2026-10-30")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.current.responses).toBe(3);
    expect(service.getFormSummary).toHaveBeenCalledWith("form-1", "user-1", {
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-10-30T23:59:59.999Z"),
    });
  });
});

describe("GET /api/forms/:formId/analytics/journeys", () => {
  beforeEach(() => {
    (service.getFormJourneys as any).mockResolvedValue({ nodes: [], links: [] });
  });

  it("за замовчуванням: усі спроби, 6 кроків", async () => {
    await request(app).get("/api/forms/form-1/analytics/journeys").set("Authorization", AUTH);

    expect(service.getFormJourneys).toHaveBeenCalledWith("form-1", "user-1", {
      status: "all",
      steps: 6,
      period: {},
    });
  });

  it("читає status і steps", async () => {
    await request(app)
      .get("/api/forms/form-1/analytics/journeys?status=abandoned&steps=3")
      .set("Authorization", AUTH);

    expect(service.getFormJourneys).toHaveBeenCalledWith("form-1", "user-1", {
      status: "abandoned",
      steps: 3,
      period: {},
    });
  });

  it("невідомий status і дивні steps повертаються до значень за замовчуванням, а надмірні steps обмежуються", async () => {
    await request(app)
      .get("/api/forms/form-1/analytics/journeys?status=hacked&steps=abc")
      .set("Authorization", AUTH);
    await request(app)
      .get("/api/forms/form-1/analytics/journeys?steps=100000")
      .set("Authorization", AUTH);

    expect(service.getFormJourneys).toHaveBeenNthCalledWith(1, "form-1", "user-1", {
      status: "all",
      steps: 6,
      period: {},
    });
    expect(service.getFormJourneys).toHaveBeenNthCalledWith(2, "form-1", "user-1", {
      status: "all",
      steps: 20,
      period: {},
    });
  });
});

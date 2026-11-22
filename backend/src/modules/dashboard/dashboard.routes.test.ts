import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildTestApp, makeAuthHeader, TEST_JWT_SECRET } from "../../test/testApp.js";

vi.mock("./dashboard.service.js", () => ({ getDashboardSummary: vi.fn() }));

const service = await import("./dashboard.service.js");
const router = (await import("./dashboard.routes.js")).default;

const app = buildTestApp(router, "/api/dashboard");
const AUTH = makeAuthHeader("user-1");

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});
beforeEach(() => vi.clearAllMocks());

describe("GET /api/dashboard/summary", () => {
  it("401 без токена", async () => {
    expect((await request(app).get("/api/dashboard/summary")).status).toBe(401);
  });

  it("повертає підсумок поточного користувача; без періоду фільтра немає", async () => {
    (service.getDashboardSummary as any).mockResolvedValue({ forms: { total: 2 } });

    const res = await request(app).get("/api/dashboard/summary").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.forms.total).toBe(2);
    expect(service.getDashboardSummary).toHaveBeenCalledWith("user-1", {});
  });

  it("період з ?from=&to= передається як Date; сміття ігнорується", async () => {
    (service.getDashboardSummary as any).mockResolvedValue({});

    await request(app)
      .get("/api/dashboard/summary?from=2026-11-01&to=2026-11-30")
      .set("Authorization", AUTH);
    await request(app).get("/api/dashboard/summary?from=вчора").set("Authorization", AUTH);

    expect(service.getDashboardSummary).toHaveBeenNthCalledWith(1, "user-1", {
      from: new Date("2026-11-01T00:00:00.000Z"),
      to: new Date("2026-11-30T23:59:59.999Z"),
    });
    expect(service.getDashboardSummary).toHaveBeenNthCalledWith(2, "user-1", {});
  });
});

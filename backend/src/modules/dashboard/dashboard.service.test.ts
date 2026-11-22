import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../prisma/prisma.js", () => ({
  prisma: {
    form: { findMany: vi.fn() },
    response: { count: vi.fn() },
    responseAttempt: { findMany: vi.fn() },
  },
}));

const { prisma } = await import("../../prisma/prisma.js");
const { getDashboardSummary } = await import("./dashboard.service.js");

const at = (iso: string) => new Date(iso);
const attempt = (id: string, startedAt: string, completedAt: string | null) => ({
  id,
  reachedQuestionIds: [],
  visibleQuestionIds: [],
  startedAt: at(startedAt),
  completedAt: completedAt ? at(completedAt) : null,
});

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.form.findMany as any).mockResolvedValue([
    { id: "f1", isPublished: true, createdAt: at("2026-11-05T10:00:00Z") },
    { id: "f2", isPublished: false, createdAt: at("2026-09-01T10:00:00Z") },
    { id: "f3", isPublished: true, createdAt: at("2026-08-01T10:00:00Z") },
  ]);
});

describe("getDashboardSummary", () => {
  it("рахує форми: усього, опубліковані, створені за період", async () => {
    (prisma.responseAttempt.findMany as any).mockResolvedValue([]);
    (prisma.response.count as any).mockResolvedValue(0);

    const summary = await getDashboardSummary("u1", {
      from: at("2026-11-01T00:00:00Z"),
      to: at("2026-11-30T23:59:59Z"),
    });

    expect(summary.forms).toEqual({ total: 3, published: 2, createdInPeriod: 1 });
  });

  it("підсумки беруться по всіх формах користувача (formId in [...]) і по періоду", async () => {
    (prisma.responseAttempt.findMany as any).mockResolvedValue([]);
    (prisma.response.count as any).mockResolvedValue(0);
    const period = { from: at("2026-11-01T00:00:00Z"), to: at("2026-11-30T23:59:59Z") };

    await getDashboardSummary("u1", period);

    const where = (prisma.responseAttempt.findMany as any).mock.calls[0][0].where;
    expect(where).toEqual({
      formId: { in: ["f1", "f2", "f3"] },
      startedAt: { gte: period.from, lte: period.to },
    });
    expect((prisma.response.count as any).mock.calls[0][0].where.formId).toEqual({
      in: ["f1", "f2", "f3"],
    });
  });

  it("частка завершення, порівняння з попереднім періодом і денна серія", async () => {
    (prisma.responseAttempt.findMany as any)
      .mockResolvedValueOnce([
        attempt("a1", "2026-11-04T09:00:00Z", "2026-11-04T09:03:00Z"),
        attempt("a2", "2026-11-04T10:00:00Z", null),
        attempt("a3", "2026-11-05T10:00:00Z", "2026-11-05T10:01:00Z"),
        attempt("a4", "2026-11-05T11:00:00Z", null),
      ])
      .mockResolvedValueOnce([attempt("b1", "2026-11-01T09:00:00Z", null)]);
    (prisma.response.count as any).mockResolvedValueOnce(2).mockResolvedValueOnce(0);

    const summary = await getDashboardSummary("u1", {
      from: at("2026-11-04T00:00:00Z"),
      to: at("2026-11-06T23:59:59.999Z"),
    });

    expect(summary.current).toMatchObject({
      responses: 2,
      started: 4,
      completed: 2,
      completionRate: 0.5,
    });
    expect(summary.previous).toMatchObject({ started: 1, completed: 0 });
    expect(summary.daily.map((d) => [d.date, d.started, d.submitted])).toEqual([
      ["2026-11-04", 2, 1],
      ["2026-11-05", 2, 1],
      ["2026-11-06", 0, 0],
    ]);
  });

  it("без періоду: без порівняння й денної серії, форм створених 'за період' 0", async () => {
    (prisma.responseAttempt.findMany as any).mockResolvedValue([]);
    (prisma.response.count as any).mockResolvedValue(0);

    const summary = await getDashboardSummary("u1");

    expect(summary.previous).toBeNull();
    expect(summary.daily).toEqual([]);
    expect(summary.forms.createdInPeriod).toBe(0);
  });

  it("користувач без форм: нулі, а не помилка", async () => {
    (prisma.form.findMany as any).mockResolvedValue([]);
    (prisma.responseAttempt.findMany as any).mockResolvedValue([]);
    (prisma.response.count as any).mockResolvedValue(0);

    const summary = await getDashboardSummary("u1");

    expect(summary.forms).toEqual({ total: 0, published: 0, createdInPeriod: 0 });
    expect(summary.current.completionRate).toBe(0);
  });
});

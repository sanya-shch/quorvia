import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The FormQuota table from the migrations, on a REAL Prisma + Postgres (PGlite): defaults, the
// bounds the database enforces itself, and the cascade.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");

const condition = { logic: "AND", rules: [{ questionId: "q1", operator: "equals", value: "a" }] };

const makeQuota = (data: Record<string, unknown> = {}) =>
  prisma.formQuota.create({
    data: { formId: "form-1", name: "Kyiv", condition, limit: 50, ...data },
  });

beforeEach(async () => {
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: "user-1", email: "a@b.c", password: "x" } });
  await prisma.form.create({ data: { id: "form-1", title: "Form", userId: "user-1" } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("FormQuota table", () => {
  it("starts empty, with no message", async () => {
    const quota = await makeQuota();

    expect(quota).toMatchObject({ count: 0, message: null, limit: 50, condition });
    expect(quota.id).toBeTruthy();
  });

  it("is removed together with its form", async () => {
    await makeQuota();
    await prisma.form.delete({ where: { id: "form-1" } });

    expect(await prisma.formQuota.count()).toBe(0);
  });

  it.each([0, -5])("refuses a limit of %i", async (limit) => {
    await expect(makeQuota({ limit })).rejects.toThrow();
  });

  it("refuses a negative count", async () => {
    const quota = await makeQuota();

    await expect(
      prisma.formQuota.update({ where: { id: quota.id }, data: { count: { decrement: 1 } } }),
    ).rejects.toThrow();
  });

  it("allows lowering the limit below the count (the quota just becomes full)", async () => {
    const quota = await makeQuota();

    await prisma.formQuota.update({ where: { id: quota.id }, data: { count: 10 } });
    const lowered = await prisma.formQuota.update({ where: { id: quota.id }, data: { limit: 3 } });

    expect(lowered).toMatchObject({ count: 10, limit: 3 });
  });

  it("lets a response remember the quotas it was counted in", async () => {
    const response = await prisma.response.create({
      data: { formId: "form-1", answers: {}, quotaIds: ["a", "b"] },
    });

    expect(response.quotaIds).toEqual(["a", "b"]);
    expect(
      (await prisma.response.create({ data: { formId: "form-1", answers: {} } })).quotaIds,
    ).toBeNull();
  });
});

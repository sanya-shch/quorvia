import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The theme on a REAL Prisma + Postgres (PGlite): storage, the public form, removal,
// duplication and defense against a tampered row.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { updateForm, getFormByShareId, getUserForm, duplicateForm } =
  await import("./form.service.js");

const USER = "user-1";
const FORM = "form-1";

const save = (data: Record<string, unknown>) =>
  updateForm(FORM, USER, { title: "Form", questions: [], ...data } as never);

const publicTheme = async () => (await getFormByShareId("share-1")).theme;

beforeEach(async () => {
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: USER, email: "a@b.c", password: "x" } });
  await prisma.form.create({
    data: { id: FORM, title: "Form", userId: USER, shareId: "share-1", isPublished: true },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("form theme", () => {
  it("is null by default", async () => {
    expect(await publicTheme()).toBeNull();
  });

  it("is stored and returned by the public and the admin form", async () => {
    await save({ theme: { mode: "dark", primaryColor: "#818CF8", font: "lora", radius: "large" } });

    const expected = { mode: "dark", primaryColor: "#818cf8", font: "lora", radius: "large" };

    expect(await publicTheme()).toEqual(expected);
    expect((await getUserForm(FORM, USER)).theme).toEqual(expected);
  });

  it("is left alone when omitted and removed by null", async () => {
    await save({ theme: { radius: "none" } });

    await save({});
    expect(await publicTheme()).toEqual({ radius: "none" });

    await save({ theme: null });
    expect(await publicTheme()).toBeNull();
  });

  it("an empty theme object means no theme", async () => {
    await save({ theme: { radius: "none" } });
    await save({ theme: {} });

    expect(await publicTheme()).toBeNull();
  });

  it("is cleaned on the way out even if the stored row was tampered with", async () => {
    await prisma.form.update({
      where: { id: FORM },
      data: {
        theme: {
          primaryColor: "#ffffff; background:url(//evil.test)",
          textColor: "#000000",
          customCss: "body{display:none}",
        },
      },
    });

    expect(await publicTheme()).toEqual({ textColor: "#000000" });
  });

  it("is copied by duplicateForm", async () => {
    await save({ theme: { mode: "dark", radius: "small" } });

    const copy = await duplicateForm(FORM, USER);
    const stored = await prisma.form.findUniqueOrThrow({ where: { id: copy.id } });

    expect(stored.theme).toEqual({ mode: "dark", radius: "small" });
  });
});

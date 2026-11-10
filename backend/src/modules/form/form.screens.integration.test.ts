import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Welcome and end screens on a REAL Prisma + Postgres (PGlite): storage, the public form, removal,
// translations, duplication and defense against a tampered row.
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

const publicForm = () => getFormByShareId("share-1");

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

describe("form screens", () => {
  it("are null by default", async () => {
    const form = await publicForm();

    expect(form.welcomeScreen).toBeNull();
    expect(form.endScreen).toBeNull();
  });

  it("are stored and returned by the public and the admin form", async () => {
    await save({
      welcomeScreen: { title: "Welcome", text: "Intro", buttonLabel: "Begin" },
      endScreen: { text: "Thanks", redirectUrl: "https://example.com/next" },
    });

    const form = await publicForm();

    expect(form.welcomeScreen).toEqual({ title: "Welcome", text: "Intro", buttonLabel: "Begin" });
    expect(form.endScreen).toEqual({ text: "Thanks", redirectUrl: "https://example.com/next" });
    expect((await getUserForm(FORM, USER)).endScreen).toEqual(form.endScreen);
  });

  it("are left alone when omitted and removed by null, each on its own", async () => {
    await save({ welcomeScreen: { title: "Welcome" }, endScreen: { text: "Thanks" } });

    await save({});
    expect((await publicForm()).welcomeScreen).toEqual({ title: "Welcome" });

    await save({ welcomeScreen: null });
    const form = await publicForm();

    expect(form.welcomeScreen).toBeNull();
    expect(form.endScreen).toEqual({ text: "Thanks" });
  });

  it("keep their translations and drop those of a removed language", async () => {
    await save({
      languages: ["en", "pl"],
      welcomeScreen: { title: "Вітаємо" },
      endScreen: { text: "Дякуємо" },
      translations: {
        en: { welcomeTitle: "Welcome", endText: "Thank you" },
        pl: { welcomeTitle: "Witamy" },
      },
    });

    expect((await publicForm()).translations).toMatchObject({
      en: { welcomeTitle: "Welcome", endText: "Thank you" },
      pl: { welcomeTitle: "Witamy" },
    });

    await save({ languages: ["en"] });

    const translations = (await publicForm()).translations as Record<string, unknown>;

    expect(Object.keys(translations)).toEqual(["en"]);
  });

  it("never expose a redirect that is not http(s), even from a tampered row", async () => {
    await prisma.form.update({
      where: { id: FORM },
      data: {
        endScreen: { text: "Thanks", redirectUrl: "javascript:alert(document.cookie)" },
        welcomeScreen: { title: "Hi", html: "<img src=x onerror=alert(1)>" },
      },
    });

    const form = await publicForm();

    expect(form.endScreen).toEqual({ text: "Thanks" });
    expect(form.welcomeScreen).toEqual({ title: "Hi" });
  });

  it("drop a screen that lost its required text", async () => {
    await prisma.form.update({
      where: { id: FORM },
      data: {
        endScreen: { redirectUrl: "https://example.com" },
        welcomeScreen: { text: "no title" },
      },
    });

    const form = await publicForm();

    expect(form.endScreen).toBeNull();
    expect(form.welcomeScreen).toBeNull();
  });

  it("are copied by duplicateForm", async () => {
    await save({
      welcomeScreen: { title: "Welcome" },
      endScreen: { text: "Thanks", redirectUrl: "https://example.com" },
    });

    const copy = await duplicateForm(FORM, USER);
    const stored = await prisma.form.findUniqueOrThrow({ where: { id: copy.id } });

    expect(stored.welcomeScreen).toEqual({ title: "Welcome" });
    expect(stored.endScreen).toEqual({ text: "Thanks", redirectUrl: "https://example.com" });
  });
});

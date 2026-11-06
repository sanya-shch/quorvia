import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@quorvia/shared-types";

// Content languages on a REAL Prisma + Postgres (PGlite with the project's migrations):
// storage, translation normalization, the public form, duplication.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { updateForm, getUserForm, getFormByShareId, duplicateForm, createForm } = await import(
  "./form.service.js"
);
const { submitResponse } = await import("../response/response.service.js");
const { getResponses, getResponseById } = await import("../analytics/analytics.service.js");

const USER = "user-lang";
const FORM = "form-lang";

const choice = {
  id: "q-choice",
  text: "Напій",
  type: "CHOICE_SINGLE" as const,
  order: 0,
  required: false,
  options: [
    { id: "o1", text: "Кава" },
    { id: "o2", text: "Чай" },
  ],
};

const save = (data: Record<string, unknown>) =>
  updateForm(FORM, USER, { title: "Опитування", questions: [choice], ...data } as never);

const read = () =>
  prisma.form.findUniqueOrThrow({ where: { id: FORM }, include: { questions: true } });

beforeEach(async () => {
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: USER, email: "l@b.c", password: "x" } });
  await prisma.form.create({
    data: { id: FORM, title: "Початкова", userId: USER, shareId: "share-lang", isPublished: true },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("мови контенту: типові значення", () => {
  it("нова форма: основна мова uk, без додаткових мов і перекладів", async () => {
    const form = await read();

    expect(form.defaultLanguage).toBe("uk");
    expect(form.languages).toEqual([]);
    expect(form.translations).toBeNull();
  });

  it("createForm приймає основну мову", async () => {
    const created = await createForm({ title: "English form", defaultLanguage: "en", userId: USER });

    expect(created.defaultLanguage).toBe("en");
  });
});

describe("updateForm: збереження мов і перекладів", () => {
  it("зберігає основну мову, додаткові мови та переклади форми й питання", async () => {
    await save({
      defaultLanguage: "uk",
      languages: ["en", "pl"],
      translations: { en: { title: "Survey" }, pl: { title: "Ankieta" } },
      questions: [
        {
          ...choice,
          translations: {
            en: { text: "Drink", options: { o1: "Coffee", o2: "Tea" } },
          },
        },
      ],
    });

    const form = await read();

    expect(form.languages).toEqual(["en", "pl"]);
    expect(form.translations).toEqual({ en: { title: "Survey" }, pl: { title: "Ankieta" } });
    expect(form.questions[0].translations).toEqual({
      en: { text: "Drink", options: { o1: "Coffee", o2: "Tea" } },
    });
  });

  it("прибирає переклади мов, яких немає у списку languages", async () => {
    await save({
      languages: ["en"],
      translations: { en: { title: "Survey" }, de: { title: "Umfrage" } },
      questions: [{ ...choice, translations: { en: { text: "Drink" }, de: { text: "Getränk" } } }],
    });

    const form = await read();

    expect(form.translations).toEqual({ en: { title: "Survey" } });
    expect(form.questions[0].translations).toEqual({ en: { text: "Drink" } });
  });

  it("прибирає переклади видаленого варіанта (клієнту не треба чистити вручну)", async () => {
    await save({
      languages: ["en"],
      questions: [{ ...choice, translations: { en: { options: { o1: "Coffee", o2: "Tea" } } } }],
    });

    await save({
      languages: ["en"],
      questions: [
        {
          ...choice,
          options: [{ id: "o1", text: "Кава" }],
          translations: { en: { options: { o1: "Coffee", o2: "Tea" } } },
        },
      ],
    });

    expect((await read()).questions[0].translations).toEqual({
      en: { options: { o1: "Coffee" } },
    });
  });

  it("зменшення списку мов прибирає й збережені переклади, навіть якщо клієнт їх не надіслав", async () => {
    await save({
      languages: ["en", "pl"],
      translations: { en: { title: "Survey" }, pl: { title: "Ankieta" } },
      questions: [{ ...choice, translations: { en: { text: "Drink" }, pl: { text: "Napój" } } }],
    });

    // the client changes only the language list and sends no translations
    await updateForm(FORM, USER, {
      title: "Опитування",
      languages: ["en"],
      questions: [{ ...choice, translations: undefined }],
    } as never);

    const form = await read();

    expect(form.languages).toEqual(["en"]);
    expect(form.translations).toEqual({ en: { title: "Survey" } });
    expect(form.questions[0].translations).toEqual({ en: { text: "Drink" } });
  });

  it("старий клієнт (без полів мов) не стирає переклади й мови", async () => {
    await save({
      languages: ["en"],
      translations: { en: { title: "Survey" } },
      questions: [{ ...choice, translations: { en: { text: "Drink" } } }],
    });

    await updateForm(FORM, USER, { title: "Нова назва", questions: [choice] } as never);

    const form = await read();

    expect(form.title).toBe("Нова назва");
    expect(form.languages).toEqual(["en"]);
    expect(form.translations).toEqual({ en: { title: "Survey" } });
    expect(form.questions[0].translations).toEqual({ en: { text: "Drink" } });
  });

  it("translations: null явно стирає переклади форми", async () => {
    await save({ languages: ["en"], translations: { en: { title: "Survey" } } });
    await save({ languages: ["en"], translations: null });

    expect((await read()).translations).toBeNull();
  });

  it("основна мова не може бути додатковою - 400", async () => {
    await expect(save({ defaultLanguage: "en", languages: ["en"] })).rejects.toMatchObject({
      message: ErrorCode.REQUEST_BODY_INVALID,
      statusCode: 400,
    });
  });

  it("зміна лише основної мови на ту, що вже є додатковою, теж відхиляється", async () => {
    await save({ languages: ["en"] });

    await expect(save({ defaultLanguage: "en" })).rejects.toMatchObject({
      message: ErrorCode.REQUEST_BODY_INVALID,
      statusCode: 400,
    });
  });

  it("зміна основної мови зберігається, переклади лишаються", async () => {
    await save({ languages: ["en"], translations: { en: { title: "Survey" } } });
    await save({ defaultLanguage: "pl", languages: ["en"], translations: { en: { title: "Survey" } } });

    const form = await read();

    expect(form.defaultLanguage).toBe("pl");
    expect(form.translations).toEqual({ en: { title: "Survey" } });
  });

  it("відхилений запит нічого не змінює (мови теж)", async () => {
    await save({ languages: ["en"] });

    await expect(save({ defaultLanguage: "en" })).rejects.toBeTruthy();

    expect((await read()).defaultLanguage).toBe("uk");
  });
});

describe("публічна форма й дублювання", () => {
  it("публічний DTO віддає мови та всі переклади (перемикання без нових запитів)", async () => {
    await save({
      defaultLanguage: "uk",
      languages: ["en"],
      translations: { en: { title: "Survey" } },
      questions: [{ ...choice, translations: { en: { text: "Drink" } } }],
    });

    const publicForm = await getFormByShareId("share-lang");

    expect(publicForm.defaultLanguage).toBe("uk");
    expect(publicForm.languages).toEqual(["en"]);
    expect(publicForm.translations).toEqual({ en: { title: "Survey" } });
    expect(publicForm.questions[0].translations).toEqual({ en: { text: "Drink" } });
  });

  it("власник бачить ті самі поля у getUserForm (для конструктора)", async () => {
    await save({ languages: ["en"], translations: { en: { title: "Survey" } } });

    const form = await getUserForm(FORM, USER);

    expect(form.languages).toEqual(["en"]);
    expect(form.translations).toEqual({ en: { title: "Survey" } });
  });

  it("дублікат форми зберігає мови й переклади (форми та питань)", async () => {
    await save({
      defaultLanguage: "uk",
      languages: ["en"],
      translations: { en: { title: "Survey" } },
      questions: [
        { ...choice, translations: { en: { text: "Drink", options: { o1: "Coffee" } } } },
      ],
    });

    const copy = await duplicateForm(FORM, USER);
    const copied = await prisma.form.findUniqueOrThrow({
      where: { id: copy.id },
      include: { questions: true },
    });

    expect(copied.defaultLanguage).toBe("uk");
    expect(copied.languages).toEqual(["en"]);
    expect(copied.translations).toEqual({ en: { title: "Survey" } });
    expect(copied.questions[0].translations).toEqual({
      en: { text: "Drink", options: { o1: "Coffee" } },
    });
  });

  it("дублікат форми без перекладів лишає translations порожніми", async () => {
    const copy = await duplicateForm(FORM, USER);
    const copied = await prisma.form.findUniqueOrThrow({ where: { id: copy.id } });

    expect(copied.translations).toBeNull();
    expect(copied.languages).toEqual([]);
  });
});

describe("мова відповіді респондента", () => {
  beforeEach(async () => {
    await save({ languages: ["en"] });
  });

  it("зберігається у відповіді та повертається в списку й деталях для власника", async () => {
    const answered = await submitResponse("share-lang", { "q-choice": "o1" }, undefined, "en-GB");

    const stored = await prisma.response.findUniqueOrThrow({ where: { id: answered.id } });
    expect(stored.language).toBe("en");

    const list = await getResponses(FORM, USER);
    expect(list.data[0]).toMatchObject({ id: answered.id, language: "en" });

    const details = await getResponseById(FORM, answered.id, USER);
    expect(details.language).toBe("en");
  });

  it("основна мова теж записується", async () => {
    const answered = await submitResponse("share-lang", { "q-choice": "o1" }, undefined, "uk");

    expect((await prisma.response.findUniqueOrThrow({ where: { id: answered.id } })).language).toBe(
      "uk",
    );
  });

  it("мова, якої немає у форми, не блокує відповідь і не записується", async () => {
    const answered = await submitResponse("share-lang", { "q-choice": "o1" }, undefined, "pl");

    expect((await prisma.response.findUniqueOrThrow({ where: { id: answered.id } })).language).toBeNull();
  });

  it("мову, яку з форми видалили, відповідь уже не отримає (кеш респондента застарів)", async () => {
    await save({ languages: [] });

    const answered = await submitResponse("share-lang", { "q-choice": "o1" }, undefined, "en");

    expect((await prisma.response.findUniqueOrThrow({ where: { id: answered.id } })).language).toBeNull();
  });
});

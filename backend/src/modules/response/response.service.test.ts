import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@quorvia/shared-types";

// The submit runs in a transaction; the mocked one hands the same mocked client to the callback, so
// the assertions below look at the same functions either way.
vi.mock("../../prisma/prisma.js", () => {
  const form = {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    fields: { maxResponses: "maxResponses" },
  };
  const response = { create: vi.fn() };
  const client: Record<string, unknown> = { form, response, $executeRaw: vi.fn() };

  client.$transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(client));

  return { prisma: client };
});

const { prisma } = await import("../../prisma/prisma.js");
const { submitResponse } = await import("./response.service.js");

const SHARE_ID = "share-1";

const publishedForm = {
  id: "form-1",
  isPublished: true,
  defaultLanguage: "uk",
  languages: ["en"] as string[],
  questions: [
    {
      id: "q-name",
      type: "TEXT",
      text: "Ім'я",
      required: true,
      order: 0,
      options: [],
      config: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  // A place is available unless a test says otherwise.
  (prisma.form.updateMany as any).mockResolvedValue({ count: 1 });
});

describe("submitResponse", () => {
  it("кидає 404, якщо форми з таким shareId не існує", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);

    await expect(submitResponse(SHARE_ID, {})).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.response.create).not.toHaveBeenCalled();
  });

  it("кидає 400, якщо форма ще не опублікована", async () => {
    (prisma.form.findUnique as any).mockResolvedValue({
      ...publishedForm,
      isPublished: false,
    });

    await expect(submitResponse(SHARE_ID, {})).rejects.toMatchObject({
      statusCode: 400,
      message: ErrorCode.FORM_NOT_PUBLISHED,
    });
  });

  it("кидає 400 з детальними помилками поля при невалідних answers", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(publishedForm);

    await expect(submitResponse(SHARE_ID, { "q-name": "" })).rejects.toMatchObject({
      statusCode: 400,
      message: ErrorCode.RESPONSE_VALIDATION_FAILED,
      errors: [{ field: "q-name", message: expect.any(String) }],
    });
    expect(prisma.response.create).not.toHaveBeenCalled();
  });

  it("зберігає валідну відповідь і повертає створений запис", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(publishedForm);
    (prisma.response.create as any).mockResolvedValue({
      id: "resp-1",
      formId: "form-1",
      answers: { "q-name": "Олександр" },
    });

    const result = await submitResponse(SHARE_ID, { "q-name": "Олександр" });

    expect(prisma.response.create).toHaveBeenCalledWith({
      data: {
        formId: "form-1",
        answers: { "q-name": "Олександр" },
        visibleQuestionIds: ["q-name"],
        language: null,
      },
    });
    expect(result.id).toBe("resp-1");
  });

  describe("мова відповіді", () => {
    const submitWith = async (language?: string) => {
      (prisma.form.findUnique as any).mockResolvedValue(publishedForm);
      (prisma.response.create as any).mockResolvedValue({ id: "resp-1", createdAt: new Date() });

      await submitResponse(SHARE_ID, { "q-name": "Олександр" }, undefined, language);

      return (prisma.response.create as any).mock.calls.at(-1)[0].data.language;
    };

    it("зберігає основну мову форми", async () => {
      expect(await submitWith("uk")).toBe("uk");
    });

    it("зберігає додаткову мову; регіон відкидається (en-GB -> en)", async () => {
      expect(await submitWith("en")).toBe("en");
      expect(await submitWith("en-GB")).toBe("en");
    });

    it("мова, якої немає у форми, - null, але відповідь приймається", async () => {
      expect(await submitWith("pl")).toBeNull();
      expect(await submitWith("???")).toBeNull();
    });

    it("без мови (старий клієнт) - null", async () => {
      expect(await submitWith(undefined)).toBeNull();
    });
  });

  it("умовно приховане питання не блокує required-валідацію і не потрапляє у збережені answers", async () => {
    const formWithCondition = {
      ...publishedForm,
      questions: [
        ...publishedForm.questions,
        {
          id: "q-followup",
          type: "TEXT",
          text: "Уточнення",
          required: true,
          order: 1,
          options: [],
          config: null,
          condition: {
            logic: "AND",
            rules: [{ questionId: "q-name", operator: "equals", value: "Тригер" }],
          },
        },
      ],
    };
    (prisma.form.findUnique as any).mockResolvedValue(formWithCondition);
    (prisma.response.create as any).mockResolvedValue({ id: "resp-2" });

    await submitResponse(SHARE_ID, { "q-name": "Олександр", "q-followup": "непрохане значення" });

    expect(prisma.response.create).toHaveBeenCalledWith({
      data: {
        formId: "form-1",
        answers: { "q-name": "Олександр" },
        visibleQuestionIds: ["q-name"],
        language: null,
      },
    });
  });

  it("умовно показане required-питання все ще валідується як обов'язкове", async () => {
    const formWithCondition = {
      ...publishedForm,
      questions: [
        ...publishedForm.questions,
        {
          id: "q-followup",
          type: "TEXT",
          text: "Уточнення",
          required: true,
          order: 1,
          options: [],
          config: null,
          condition: {
            logic: "AND",
            rules: [{ questionId: "q-name", operator: "equals", value: "Тригер" }],
          },
        },
      ],
    };
    (prisma.form.findUnique as any).mockResolvedValue(formWithCondition);

    await expect(submitResponse(SHARE_ID, { "q-name": "Тригер" })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prisma.response.create).not.toHaveBeenCalled();
  });

  it("з sessionKey - завершує ResponseAttempt і дописує видимі питання до reached", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(publishedForm);
    (prisma.response.create as any).mockResolvedValue({ id: "resp-1" });

    await submitResponse(SHARE_ID, { "q-name": "Олександр" }, "session-abc");

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = (prisma.$executeRaw as any).mock.calls[0][0];
    expect(sql.text).toContain('"completedAt" = CURRENT_TIMESTAMP');
    // [reached JSON, formId, sessionKey]
    expect(sql.values).toEqual([JSON.stringify(["q-name"]), "form-1", "session-abc"]);
  });

  it("без sessionKey - НЕ чіпає ResponseAttempt взагалі", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(publishedForm);
    (prisma.response.create as any).mockResolvedValue({ id: "resp-1" });

    await submitResponse(SHARE_ID, { "q-name": "Олександр" });

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

describe("submitResponse: closed forms", () => {
  const PAST = new Date(Date.now() - 60_000);
  const FUTURE = new Date(Date.now() + 3_600_000);
  const valid = { "q-name": "Іра" };

  it("refuses a form whose closing date has passed, before doing anything else", async () => {
    (prisma.form.findUnique as any).mockResolvedValue({ ...publishedForm, closesAt: PAST });

    await expect(submitResponse(SHARE_ID, valid)).rejects.toMatchObject({
      statusCode: 410,
      message: ErrorCode.FORM_CLOSED_BY_DATE,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.response.create).not.toHaveBeenCalled();
  });

  it("refuses a form that reached its response limit", async () => {
    (prisma.form.findUnique as any).mockResolvedValue({
      ...publishedForm,
      maxResponses: 5,
      responseCount: 5,
    });

    await expect(submitResponse(SHARE_ID, valid)).rejects.toMatchObject({
      statusCode: 410,
      message: ErrorCode.FORM_CLOSED_BY_LIMIT,
    });
    expect(prisma.response.create).not.toHaveBeenCalled();
  });

  it("reports the date when both rules apply", async () => {
    (prisma.form.findUnique as any).mockResolvedValue({
      ...publishedForm,
      closesAt: PAST,
      maxResponses: 1,
      responseCount: 9,
    });

    await expect(submitResponse(SHARE_ID, valid)).rejects.toMatchObject({
      message: ErrorCode.FORM_CLOSED_BY_DATE,
    });
  });

  it("accepts a form that is still open by both rules", async () => {
    (prisma.form.findUnique as any).mockResolvedValue({
      ...publishedForm,
      closesAt: FUTURE,
      maxResponses: 5,
      responseCount: 4,
    });
    (prisma.response.create as any).mockResolvedValue({ id: "r1" });

    await expect(submitResponse(SHARE_ID, valid)).resolves.toMatchObject({ id: "r1" });
  });

  it("takes a place and creates the response in one transaction, place first", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(publishedForm);
    (prisma.response.create as any).mockResolvedValue({ id: "r1" });

    await submitResponse(SHARE_ID, valid);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const claim = (prisma.form.updateMany as any).mock.invocationCallOrder[0];
    const create = (prisma.response.create as any).mock.invocationCallOrder[0];

    expect(claim).toBeLessThan(create);
    expect(prisma.form.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "form-1" }),
        data: { responseCount: { increment: 1 } },
      }),
    );
  });

  it("creates nothing when the atomic claim finds the form full (the race for the last place)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue({
      ...publishedForm,
      maxResponses: 5,
      responseCount: 4,
    });
    // Someone else took the last place between the read above and the claim.
    (prisma.form.updateMany as any).mockResolvedValue({ count: 0 });
    (prisma.form.findUnique as any).mockResolvedValueOnce({
      ...publishedForm,
      maxResponses: 5,
      responseCount: 4,
    });
    (prisma.form.findUnique as any).mockResolvedValueOnce({
      maxResponses: 5,
      responseCount: 5,
      closesAt: null,
    });

    await expect(submitResponse(SHARE_ID, valid)).rejects.toMatchObject({
      statusCode: 410,
      message: ErrorCode.FORM_CLOSED_BY_LIMIT,
    });
    expect(prisma.response.create).not.toHaveBeenCalled();
  });

  it("names the date when the form closed between the read and the claim", async () => {
    (prisma.form.findUnique as any).mockResolvedValueOnce({ ...publishedForm, closesAt: FUTURE });
    (prisma.form.updateMany as any).mockResolvedValue({ count: 0 });
    (prisma.form.findUnique as any).mockResolvedValueOnce({
      maxResponses: null,
      responseCount: 3,
      closesAt: PAST,
    });

    await expect(submitResponse(SHARE_ID, valid)).rejects.toMatchObject({
      message: ErrorCode.FORM_CLOSED_BY_DATE,
    });
  });
});

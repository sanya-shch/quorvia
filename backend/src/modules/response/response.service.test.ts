import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@quorvia/shared-types";

vi.mock("../../prisma/prisma.js", () => ({
  prisma: {
    form: { findUnique: vi.fn() },
    response: { create: vi.fn() },
    responseAttempt: { updateMany: vi.fn() },
  },
}));

const { prisma } = await import("../../prisma/prisma.js");
const { submitResponse } = await import("./response.service.js");

const SHARE_ID = "share-1";

const publishedForm = {
  id: "form-1",
  isPublished: true,
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
      },
    });
    expect(result.id).toBe("resp-1");
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

  it("з sessionKey - позначає відповідний ResponseAttempt як завершений (completedAt)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(publishedForm);
    (prisma.response.create as any).mockResolvedValue({ id: "resp-1" });

    await submitResponse(SHARE_ID, { "q-name": "Олександр" }, "session-abc");

    expect(prisma.responseAttempt.updateMany).toHaveBeenCalledWith({
      where: { formId: "form-1", sessionKey: "session-abc" },
      data: { completedAt: expect.any(Date) },
    });
  });

  it("без sessionKey - НЕ чіпає ResponseAttempt взагалі", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(publishedForm);
    (prisma.response.create as any).mockResolvedValue({ id: "resp-1" });

    await submitResponse(SHARE_ID, { "q-name": "Олександр" });

    expect(prisma.responseAttempt.updateMany).not.toHaveBeenCalled();
  });
});

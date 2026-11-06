import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@quorvia/shared-types";

vi.mock("../../prisma/prisma.js", () => ({
  prisma: {
    form: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    question: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import("../../prisma/prisma.js");
const {
  createForm,
  getUserForms,
  deleteForm,
  getUserForm,
  getFormByShareId,
  updateForm,
  publishForm,
  unpublishForm,
  duplicateForm,
} = await import("./form.service.js");

const OWNER_ID = "user-owner";
const OTHER_USER_ID = "user-other";
const FORM_ID = "form-1";

const mockForm = (overrides: Record<string, unknown> = {}) => ({
  id: FORM_ID,
  userId: OWNER_ID,
  title: "Форма",
  version: 1,
  // content language columns (always present in a real DB, defaults here)
  defaultLanguage: "uk",
  languages: [] as string[],
  translations: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.question.count as any).mockResolvedValue(0);
});

describe("createForm", () => {
  it("передає title/description/userId у prisma.form.create", async () => {
    (prisma.form.create as any).mockResolvedValue(mockForm());

    await createForm({ title: "Нова форма", description: "опис", userId: OWNER_ID });

    expect(prisma.form.create).toHaveBeenCalledWith({
      data: { title: "Нова форма", description: "опис", userId: OWNER_ID },
    });
  });
});

describe("getUserForms", () => {
  it("запитує форми користувача, відсортовані за createdAt desc, з лічильниками", async () => {
    (prisma.form.findMany as any).mockResolvedValue([]);

    await getUserForms(OWNER_ID);

    expect(prisma.form.findMany).toHaveBeenCalledWith({
      where: { userId: OWNER_ID },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { questions: true, responses: true } } },
    });
  });
});

describe("deleteForm", () => {
  it("кидає 404, якщо форми не існує", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);

    await expect(deleteForm(FORM_ID, OWNER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.form.delete).not.toHaveBeenCalled();
  });

  it("кидає 403, якщо викликає не власник", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());

    await expect(deleteForm(FORM_ID, OTHER_USER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prisma.form.delete).not.toHaveBeenCalled();
  });

  it("видаляє форму, якщо викликає власник", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());

    await deleteForm(FORM_ID, OWNER_ID);

    expect(prisma.form.delete).toHaveBeenCalledWith({ where: { id: FORM_ID } });
  });
});

describe("getUserForm", () => {
  it("кидає 404/403 так само, як deleteForm", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);
    await expect(getUserForm(FORM_ID, OWNER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });

    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    await expect(getUserForm(FORM_ID, OTHER_USER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("повертає форму з питаннями (сортованими за order) власнику", async () => {
    const form = mockForm({ questions: [] });
    (prisma.form.findUnique as any).mockResolvedValue(form);

    const result = await getUserForm(FORM_ID, OWNER_ID);

    expect(prisma.form.findUnique).toHaveBeenCalledWith({
      where: { id: FORM_ID },
      include: {
        questions: { orderBy: { order: "asc" } },
        _count: { select: { responses: true } },
      },
    });
    expect(result).toBe(form);
  });
});

describe("getFormByShareId", () => {
  it("кидає 404, якщо форми не існує", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);

    await expect(getFormByShareId("share-1")).rejects.toMatchObject({
      statusCode: 404,
      message: ErrorCode.FORM_NOT_AVAILABLE,
    });
  });

  it("кидає 404 і для існуючої, але неопублікованої форми (не розкриває, яка саме причина)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ isPublished: false }));

    await expect(getFormByShareId("share-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("повертає лише публічні поля опублікованої форми (без userId/shareId)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(
      mockForm({
        isPublished: true,
        description: "опис",
        questions: [{ id: "q-1" }],
        shareId: "share-1",
      }),
    );

    const result = await getFormByShareId("share-1");

    expect(result).toEqual({
      id: FORM_ID,
      title: "Форма",
      description: "опис",
      defaultLanguage: "uk",
      languages: [],
      translations: null,
      questions: [{ id: "q-1" }],
    });
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("shareId");
  });

  it("передає responseMode у публічний DTO - viewer має знати, чи показувати покроковий режим", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(
      mockForm({ isPublished: true, questions: [], responseMode: "STEP_BY_STEP" }),
    );

    const result = await getFormByShareId("share-1");

    expect(result.responseMode).toBe("STEP_BY_STEP");
  });
});

describe("publishForm", () => {
  it("кидає 404, якщо форми не існує", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);

    await expect(publishForm(FORM_ID, OWNER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("кидає 404/403 так само, як інші власницькі операції", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());

    await expect(publishForm(FORM_ID, OTHER_USER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("виставляє isPublished: true для власника", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());

    await publishForm(FORM_ID, OWNER_ID);

    expect(prisma.form.update).toHaveBeenCalledWith({
      where: { id: FORM_ID },
      data: { isPublished: true },
    });
  });
});

describe("unpublishForm", () => {
  it("кидає 404, якщо форми не існує", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);

    await expect(unpublishForm(FORM_ID, OWNER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.form.update).not.toHaveBeenCalled();
  });

  it("кидає 403, якщо викликає не власник форми", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());

    await expect(unpublishForm(FORM_ID, OTHER_USER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prisma.form.update).not.toHaveBeenCalled();
  });

  it("знімає форму з публікації для власника", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm());
    (prisma.form.update as any).mockResolvedValue(mockForm({ isPublished: false }));

    await unpublishForm(FORM_ID, OWNER_ID);

    expect(prisma.form.update).toHaveBeenCalledWith({
      where: { id: FORM_ID },
      data: { isPublished: false },
    });
  });
});

describe("duplicateForm", () => {
  it("кидає 404, якщо оригінальної форми не існує", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);

    await expect(duplicateForm(FORM_ID, OWNER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("кидає 403, якщо форма належить іншому користувачу (не дозволяє дублювати чужі форми)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ title: "Оригінал" }));

    await expect(duplicateForm(FORM_ID, OTHER_USER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('створює копію з припискою "(Copy)", неопубліковану, з питаннями оригіналу', async () => {
    (prisma.form.findUnique as any).mockResolvedValue(
      mockForm({
        title: "Оригінал",
        description: "опис",
        questions: [
          {
            text: "Q1",
            description: null,
            type: "TEXT",
            required: true,
            order: 0,
            options: [],
            config: null,
          },
        ],
      }),
    );

    const txForm = { create: vi.fn().mockResolvedValue({ id: "form-2" }) };
    const txQuestion = { createMany: vi.fn().mockResolvedValue({ count: 1 }) };
    (prisma.$transaction as any).mockImplementation((cb: any) =>
      cb({ form: txForm, question: txQuestion }),
    );

    const result = await duplicateForm(FORM_ID, OWNER_ID);

    expect(txForm.create).toHaveBeenCalledWith({
      data: {
        title: "Оригінал (Copy)",
        description: "опис",
        defaultLanguage: "uk",
        languages: [],
        userId: OWNER_ID,
        isPublished: false,
      },
    });
    expect(txQuestion.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ text: "Q1", formId: "form-2" })],
    });
    expect(result).toEqual({ id: "form-2" });
  });

  it("копіює responseMode оригіналу (не використовує Prisma-дефолт)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(
      mockForm({
        title: "Оригінал",
        description: null,
        responseMode: "STEP_BY_STEP",
        questions: [],
      }),
    );

    const txForm = { create: vi.fn().mockResolvedValue({ id: "form-2" }) };
    const txQuestion = { createMany: vi.fn().mockResolvedValue({ count: 0 }) };
    (prisma.$transaction as any).mockImplementation((cb: any) =>
      cb({ form: txForm, question: txQuestion }),
    );

    await duplicateForm(FORM_ID, OWNER_ID);

    expect(txForm.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ responseMode: "STEP_BY_STEP" }) }),
    );
  });

  it("підставляє порожній масив, якщо options оригінального питання не є масивом", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(
      mockForm({
        title: "Оригінал",
        description: null,
        questions: [
          {
            text: "Q1",
            description: null,
            type: "TEXT",
            required: false,
            order: 0,
            options: null,
            config: null,
          },
        ],
      }),
    );

    const txForm = { create: vi.fn().mockResolvedValue({ id: "form-2" }) };
    const txQuestion = { createMany: vi.fn().mockResolvedValue({ count: 1 }) };
    (prisma.$transaction as any).mockImplementation((cb: any) =>
      cb({ form: txForm, question: txQuestion }),
    );

    await duplicateForm(FORM_ID, OWNER_ID);

    expect(txQuestion.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ options: [] })],
    });
  });
});

describe("updateForm", () => {
  const existingQuestions = [
    { id: "q-keep", text: "Лишається", type: "TEXT", order: 0 },
    { id: "q-remove", text: "Видаляється", type: "TEXT", order: 1 },
  ];

  const setupTransactionMocks = () => {
    const txForm = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const txQuestion = {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    (prisma.$transaction as any).mockImplementation((cb: any) =>
      cb({ form: txForm, question: txQuestion }),
    );
    return { txForm, txQuestion };
  };

  it("кидає 404/403 перед відкриттям транзакції", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);
    await expect(
      updateForm(FORM_ID, OWNER_ID, { title: "X", questions: [] }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.$transaction).not.toHaveBeenCalled();

    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: existingQuestions }));
    await expect(
      updateForm(FORM_ID, OTHER_USER_ID, { title: "X", questions: [] }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("кидає 409, якщо клієнтський id нового питання вже зайнятий (напр. в іншій формі)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: existingQuestions }));
    (prisma.question.count as any).mockResolvedValue(1);

    await expect(
      updateForm(FORM_ID, OWNER_ID, {
        title: "Форма",
        questions: [{ id: "foreign-id", text: "Нове", type: "TEXT", order: 0 }],
      } as any),
    ).rejects.toMatchObject({ statusCode: 409, message: ErrorCode.FORM_QUESTION_ID_CONFLICT });

    expect(prisma.question.count).toHaveBeenCalledWith({ where: { id: { in: ["foreign-id"] } } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("не звертається до БД за колізіями, якщо нових клієнтських id немає", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: existingQuestions }));
    setupTransactionMocks();

    await updateForm(FORM_ID, OWNER_ID, {
      title: "Форма",
      questions: [{ id: "q-keep", text: "Лишається", type: "TEXT", order: 0 }],
    } as any);

    expect(prisma.question.count).not.toHaveBeenCalled();
  });

  it("видаляє питання, відсутні у вхідному наборі", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: existingQuestions }));
    const { txQuestion } = setupTransactionMocks();

    await updateForm(FORM_ID, OWNER_ID, {
      title: "Форма",
      questions: [{ id: "q-keep", text: "Лишається", type: "TEXT", order: 0 }],
    } as any);

    expect(txQuestion.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["q-remove"] } },
    });
  });

  it("оновлює питання з id і створює питання без id, в одній транзакції", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: existingQuestions }));
    const { txQuestion, txForm } = setupTransactionMocks();

    await updateForm(FORM_ID, OWNER_ID, {
      title: "Оновлена назва",
      questions: [
        { id: "q-keep", text: "Оновлений текст", type: "TEXT", order: 0 },
        { text: "Нове питання", type: "TEXT", order: 1 },
      ],
    } as any);

    expect(txForm.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FORM_ID, version: 1 },
        data: expect.objectContaining({ title: "Оновлена назва" }),
      }),
    );
    expect(txQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "q-keep" },
        data: expect.objectContaining({ text: "Оновлений текст" }),
      }),
    );
    expect(txQuestion.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ text: "Нове питання", formId: FORM_ID })],
    });
  });

  it("передає responseMode в оновлення форми, коли він переданий", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [] }));
    const { txForm } = setupTransactionMocks();

    await updateForm(FORM_ID, OWNER_ID, {
      title: "Форма",
      responseMode: "STEP_BY_STEP",
      questions: [],
    } as any);

    expect(txForm.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ responseMode: "STEP_BY_STEP" }) }),
    );
  });

  it("не чіпає responseMode у БД, якщо його не передали (Prisma: undefined = не змінювати)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [] }));
    const { txForm } = setupTransactionMocks();

    await updateForm(FORM_ID, OWNER_ID, { title: "Форма", questions: [] } as any);

    expect(txForm.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ responseMode: undefined }) }),
    );
  });

  it("кидає 400 і не відкриває транзакцію, якщо condition утворює цикл", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [] }));

    await expect(
      updateForm(FORM_ID, OWNER_ID, {
        title: "Форма",
        questions: [
          {
            id: "q1",
            text: "Q1",
            type: "TEXT",
            order: 0,
            condition: {
              logic: "AND",
              rules: [{ questionId: "q2", operator: "equals", value: "y" }],
            },
          },
          {
            id: "q2",
            text: "Q2",
            type: "TEXT",
            order: 0,
            condition: {
              logic: "AND",
              rules: [{ questionId: "q1", operator: "equals", value: "y" }],
            },
          },
        ],
      } as any),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("зберігає й ремапить умови для нового питання без id, посилаючись на нього самого через згенерований id", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [] }));
    const { txQuestion } = setupTransactionMocks();

    await updateForm(FORM_ID, OWNER_ID, {
      title: "Форма",
      questions: [
        { id: "q1", text: "Q1", type: "TEXT", order: 0 },
        {
          text: "Q2 (нове)",
          type: "TEXT",
          order: 1,
          condition: {
            logic: "AND",
            rules: [{ questionId: "q1", operator: "equals", value: "y" }],
          },
        },
      ],
    } as any);

    // q1 is also new in this case (no existing questions), so both questions go to createMany
    // with the client id "q1" kept as is.
    expect(txQuestion.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ id: "q1", text: "Q1" }),
        expect.objectContaining({
          text: "Q2 (нове)",
          condition: {
            logic: "AND",
            rules: [{ questionId: "q1", operator: "equals", value: "y" }],
          },
        }),
      ],
    });
  });

  it("повертає { success: true } при успішній транзакції", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(mockForm({ questions: [] }));
    setupTransactionMocks();

    const result = await updateForm(FORM_ID, OWNER_ID, {
      title: "Форма",
      questions: [],
    } as any);

    expect(result).toEqual({ success: true, version: 2 });
  });

  describe("optimistic locking (version)", () => {
    it("умовно оновлює форму за переданою клієнтом версією й збільшує її на 1", async () => {
      (prisma.form.findUnique as any).mockResolvedValue(mockForm({ version: 5, questions: [] }));
      const { txForm } = setupTransactionMocks();

      const result = await updateForm(FORM_ID, OWNER_ID, {
        title: "Форма",
        questions: [],
        version: 5,
      } as any);

      expect(txForm.updateMany).toHaveBeenCalledWith({
        where: { id: FORM_ID, version: 5 },
        data: expect.objectContaining({ version: { increment: 1 } }),
      });
      expect(result).toEqual({ success: true, version: 6 });
    });

    it("без version у запиті використовує версію, прочитану на початку (захист від гонки всередині запиту)", async () => {
      (prisma.form.findUnique as any).mockResolvedValue(mockForm({ version: 7, questions: [] }));
      const { txForm } = setupTransactionMocks();

      await updateForm(FORM_ID, OWNER_ID, { title: "Форма", questions: [] } as any);

      expect(txForm.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: FORM_ID, version: 7 } }),
      );
    });

    it("409 FORM_VERSION_CONFLICT, якщо форму змінили після того, як клієнт її завантажив", async () => {
      (prisma.form.findUnique as any).mockResolvedValue(mockForm({ version: 6, questions: [] }));
      const { txForm, txQuestion } = setupTransactionMocks();
      txForm.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        updateForm(FORM_ID, OWNER_ID, { title: "Форма", questions: [], version: 5 } as any),
      ).rejects.toMatchObject({ message: ErrorCode.FORM_VERSION_CONFLICT, statusCode: 409 });

      // the conflict is the FIRST thing in the transaction: questions are not touched
      expect(txQuestion.deleteMany).not.toHaveBeenCalled();
      expect(txQuestion.update).not.toHaveBeenCalled();
      expect(txQuestion.createMany).not.toHaveBeenCalled();
    });
  });
});

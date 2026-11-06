import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

vi.mock("../../prisma/prisma.js", () => ({
  prisma: {
    form: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

const { prisma } = await import("../../prisma/prisma.js");
const { saveAttempt, resolveReachedQuestionIds } = await import("./attempt.service.js");

const SHARE_ID = "share-1";

const textQuestion = (id: string, order: number, condition?: unknown) => ({
  id,
  type: "TEXT",
  text: id,
  required: false,
  order,
  options: [],
  config: null,
  condition: condition ?? null,
});

const publishedForm = {
  id: "form-1",
  isPublished: true,
  questions: [{ ...textQuestion("q-1", 0), text: "Ім'я", required: true }],
};

const conditionalForm = {
  ...publishedForm,
  questions: [
    publishedForm.questions[0],
    textQuestion("q-2", 1, {
      logic: "AND",
      rules: [{ questionId: "q-1", operator: "equals", value: "тригер" }],
    }),
  ],
};

// SQL parameters $queryRaw was called with (the order is defined by buildUpsertAttemptSql).
const upsertParams = () => {
  const sql = (prisma.$queryRaw as any).mock.calls[0][0] as Prisma.Sql;
  const [id, formId, sessionKey, answers, visible, reached] = sql.values as string[];

  return {
    id,
    formId,
    sessionKey,
    answers: JSON.parse(answers),
    visibleQuestionIds: JSON.parse(visible),
    reachedQuestionIds: JSON.parse(reached),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.$queryRaw as any).mockResolvedValue([{ id: "attempt-1", updatedAt: new Date("2026-01-01") }]);
});

describe("saveAttempt", () => {
  it("кидає 404, якщо форми з таким shareId не існує", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(null);

    await expect(saveAttempt(SHARE_ID, "session-1", {})).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("кидає 400, якщо форма ще не опублікована", async () => {
    (prisma.form.findUnique as any).mockResolvedValue({ ...publishedForm, isPublished: false });

    await expect(saveAttempt(SHARE_ID, "session-1", {})).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("НЕ вимагає required-поля - часткові/порожні answers приймаються (це чернетка, не фінальний сабміт)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(publishedForm);

    // the required field q-1 is empty: this must not throw
    const result = await saveAttempt(SHARE_ID, "session-1", {});

    expect(result.id).toBe("attempt-1");
  });

  it("зберігає answers, visibleQuestionIds і reachedQuestionIds для (formId, sessionKey)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(publishedForm);

    await saveAttempt(SHARE_ID, "session-1", { "q-1": "Олександр" });

    expect(upsertParams()).toMatchObject({
      formId: "form-1",
      sessionKey: "session-1",
      answers: { "q-1": "Олександр" },
      visibleQuestionIds: ["q-1"],
      reachedQuestionIds: ["q-1"],
    });
  });

  it("вирізає answer для питання, прихованого умовою (той самий принцип, що й submitResponse)", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(conditionalForm);

    // q-1 != "trigger" => q-2 is hidden, its value must be cut out
    await saveAttempt(SHARE_ID, "session-1", { "q-1": "не тригер", "q-2": "непрохане значення" });

    const params = upsertParams();
    expect(params.answers).toEqual({ "q-1": "не тригер" });
    expect(params.visibleQuestionIds).toEqual(["q-1"]);
  });

  it("умовне питання ПОКАЗАНЕ, коли тригер виконано - потрапляє у visibleQuestionIds", async () => {
    (prisma.form.findUnique as any).mockResolvedValue(conditionalForm);

    await saveAttempt(SHARE_ID, "session-1", { "q-1": "тригер" });

    expect(upsertParams().visibleQuestionIds).toEqual(["q-1", "q-2"]);
  });

  describe("reachedQuestionIds", () => {
    it("без списку від клієнта (режим ALL_AT_ONCE) - досягнуті = усі зараз видимі", async () => {
      (prisma.form.findUnique as any).mockResolvedValue(conditionalForm);

      await saveAttempt(SHARE_ID, "session-1", { "q-1": "тригер" });

      expect(upsertParams().reachedQuestionIds).toEqual(["q-1", "q-2"]);
    });

    it("зі списком від клієнта (покроковий режим) - береться саме він, а не всі видимі", async () => {
      // Linear form: q-1 and q-2 are both visible from the start, but the respondent is still on
      // the first step, so q-2 must not count as reached.
      const linear = { ...publishedForm, questions: [textQuestion("q-1", 0), textQuestion("q-2", 1)] };
      (prisma.form.findUnique as any).mockResolvedValue(linear);

      await saveAttempt(SHARE_ID, "session-1", {}, ["q-1"]);

      const params = upsertParams();
      expect(params.visibleQuestionIds).toEqual(["q-1", "q-2"]);
      expect(params.reachedQuestionIds).toEqual(["q-1"]);
    });

    it("питання, що стало прихованим, лишається в переданому клієнтом reached (кейс з рев'ю)", async () => {
      (prisma.form.findUnique as any).mockResolvedValue(conditionalForm);

      // The respondent saw q-2, then changed q-1 -> q-2 is now hidden.
      await saveAttempt(SHARE_ID, "session-1", { "q-1": "інакше" }, ["q-1", "q-2"]);

      const params = upsertParams();
      expect(params.visibleQuestionIds).toEqual(["q-1"]);
      expect(params.reachedQuestionIds).toEqual(["q-1", "q-2"]);
    });

    it("відкидає id, яких немає у формі", async () => {
      (prisma.form.findUnique as any).mockResolvedValue(publishedForm);

      await saveAttempt(SHARE_ID, "session-1", {}, ["q-1", "чужий-id", "q-999"]);

      expect(upsertParams().reachedQuestionIds).toEqual(["q-1"]);
    });
  });
});

describe("resolveReachedQuestionIds", () => {
  const formIds = new Set(["a", "b", "c"]);

  it("fallback на visible, коли клієнт нічого не передав", () => {
    expect(resolveReachedQuestionIds(formIds, new Set(["a", "b"]), undefined)).toEqual(["a", "b"]);
  });

  it("порожній список від клієнта - це валідне значення, а не fallback", () => {
    expect(resolveReachedQuestionIds(formIds, new Set(["a", "b"]), [])).toEqual([]);
  });

  it("прибирає дублікати й невідомі id", () => {
    expect(resolveReachedQuestionIds(formIds, new Set(), ["a", "a", "x", "c"])).toEqual(["a", "c"]);
  });
});

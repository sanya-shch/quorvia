import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Conditional end screens on a REAL Prisma + Postgres (PGlite): saving and validating the rules,
// keeping them out of the public form, duplicating, and deciding the screen on submit.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { updateForm, getFormByShareId, getUserForm, duplicateForm } =
  await import("./form.service.js");
const { submitResponse } = await import("../response/response.service.js");

const USER = "user-1";
const FORM = "form-1";
const SHARE = "share-1";

const score = {
  id: "q-score",
  text: "Score",
  type: "NUMBER" as const,
  order: 0,
  required: false,
};
const choice = {
  id: "q-choice",
  text: "Plan",
  type: "CHOICE_SINGLE" as const,
  order: 1,
  required: false,
  options: [
    { id: "o-free", text: "Free" },
    { id: "o-pro", text: "Pro" },
  ],
  // Only shown for a high score.
  condition: {
    logic: "AND" as const,
    rules: [{ questionId: "q-score", operator: "gt" as const, value: 5 }],
  },
};

const high = {
  id: "high",
  condition: { logic: "AND", rules: [{ questionId: "q-score", operator: "gt", value: 8 }] },
  screen: { text: "Great!", redirectUrl: "https://example.com/great" },
};
const pro = {
  id: "pro",
  condition: {
    logic: "AND",
    rules: [{ questionId: "q-choice", operator: "equals", value: "o-pro" }],
  },
  screen: { text: "Welcome, Pro" },
};

const save = (data: Record<string, unknown>) =>
  updateForm(FORM, USER, { title: "Form", questions: [score, choice], ...data } as never);

const publicForm = () => getFormByShareId(SHARE);
const adminForm = () => getUserForm(FORM, USER);

beforeEach(async () => {
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: USER, email: "a@b.c", password: "x" } });
  await prisma.form.create({
    data: { id: FORM, title: "Form", userId: USER, shareId: SHARE, isPublished: true },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("end rules: storage", () => {
  it("are stored for the owner and never sent to respondents", async () => {
    await save({ endRules: [high, pro], endScreen: { text: "Thanks" } });

    expect((await adminForm()).endRules).toEqual([high, pro]);

    const form = await publicForm();

    expect(form).not.toHaveProperty("endRules");
    expect(JSON.stringify(form)).not.toContain("Great!");
    expect(JSON.stringify(form)).not.toContain("example.com/great");
    expect(form.endScreen).toEqual({ text: "Thanks" });
  });

  it("are left alone when omitted and removed by null or an empty list", async () => {
    await save({ endRules: [high] });
    await save({});
    expect((await adminForm()).endRules).toEqual([high]);

    await save({ endRules: null });
    expect((await adminForm()).endRules).toBeNull();

    await save({ endRules: [high] });
    await save({ endRules: [] });
    expect((await adminForm()).endRules).toBeNull();
  });

  it("keep the order they were sent in", async () => {
    await save({ endRules: [pro, high] });

    expect(((await adminForm()).endRules as { id: string }[]).map((r) => r.id)).toEqual([
      "pro",
      "high",
    ]);
  });

  it("do not leak their translated texts into the public form", async () => {
    await save({
      defaultLanguage: "uk",
      languages: ["en"],
      endRules: [high],
      translations: { en: { endText: "Bye", endRules: { high: "Great (en)!" } } },
    });

    expect((await adminForm()).translations).toEqual({
      en: { endText: "Bye", endRules: { high: "Great (en)!" } },
    });
    expect((await publicForm()).translations).toEqual({ en: { endText: "Bye" } });
  });

  it("drop the translated text of a rule that was removed", async () => {
    await save({
      defaultLanguage: "uk",
      languages: ["en"],
      endRules: [high, pro],
      translations: { en: { endRules: { high: "One", pro: "Two" } } },
    });

    await save({ endRules: [pro] });

    expect((await adminForm()).translations).toEqual({ en: { endRules: { pro: "Two" } } });
  });
});

describe("end rules: validation", () => {
  const rejected = async (data: Record<string, unknown>) => {
    await expect(save(data)).rejects.toMatchObject({
      message: "FORM_INVALID_END_RULES",
      statusCode: 400,
    });
  };

  it("refuses a rule on a question the form does not have, and changes nothing", async () => {
    await save({ endRules: [high] });

    await rejected({
      title: "Changed",
      endRules: [
        {
          ...high,
          condition: { logic: "AND", rules: [{ questionId: "nope", operator: "gt", value: 1 }] },
        },
      ],
    });

    const form = await adminForm();

    expect(form.title).toBe("Form");
    expect(form.endRules).toEqual([high]);
  });

  it("refuses a rule on a question type that cannot be compared", async () => {
    const ranking = {
      id: "q-rank",
      text: "Rank",
      type: "RANKING" as const,
      order: 2,
      required: false,
      options: [
        { id: "r1", text: "A" },
        { id: "r2", text: "B" },
      ],
    };

    await rejected({
      questions: [score, ranking],
      endRules: [
        {
          ...high,
          condition: {
            logic: "AND",
            rules: [{ questionId: "q-rank", operator: "equals", value: "r1" }],
          },
        },
      ],
    });
  });

  it("refuses to delete a question that a stored rule still looks at", async () => {
    // Only the rule looks at q-choice, so only the rule check can refuse this.
    await save({ endRules: [pro] });

    await rejected({ questions: [score] });
    expect((await adminForm()).questions).toHaveLength(2);
  });

  it("allows deleting the question together with its rule", async () => {
    await save({ endRules: [high] });

    await save({ questions: [], endRules: null });

    expect((await adminForm()).questions).toHaveLength(0);
  });

  it("refuses repeated rule ids and too many rules at the schema level", async () => {
    const { updateFormSchema } = await import("./form.schema.js");
    const base = { title: "Form", questions: [] };

    expect(updateFormSchema.safeParse({ ...base, endRules: [high, high] }).success).toBe(false);
    expect(
      updateFormSchema.safeParse({
        ...base,
        endRules: Array.from({ length: 11 }, (_, i) => ({ ...high, id: `r${i}` })),
      }).success,
    ).toBe(false);
    expect(
      updateFormSchema.safeParse({
        ...base,
        endRules: [{ ...high, screen: { text: "x", redirectUrl: "javascript:alert(1)" } }],
      }).success,
    ).toBe(false);
    expect(
      updateFormSchema.safeParse({ ...base, endRules: [{ ...high, extra: true }] }).success,
    ).toBe(false);
    expect(updateFormSchema.safeParse({ ...base, endRules: [high] }).success).toBe(true);
  });
});

describe("end rules: duplicating a form", () => {
  it("points the copy's rules at the copy's own questions", async () => {
    await save({
      defaultLanguage: "uk",
      languages: ["en"],
      endRules: [high, pro],
      translations: { en: { endRules: { high: "Great (en)!" } } },
    });

    const copy = await duplicateForm(FORM, USER);
    const stored = await prisma.form.findUniqueOrThrow({
      where: { id: copy.id },
      include: { questions: true },
    });
    const ids = Object.fromEntries(stored.questions.map((q) => [q.text, q.id]));

    expect(ids.Score).not.toBe("q-score");
    expect(stored.endRules).toEqual([
      {
        ...high,
        condition: { logic: "AND", rules: [{ ...high.condition.rules[0], questionId: ids.Score }] },
      },
      {
        ...pro,
        condition: { logic: "AND", rules: [{ ...pro.condition.rules[0], questionId: ids.Plan }] },
      },
    ]);
    expect(stored.translations).toEqual({ en: { endRules: { high: "Great (en)!" } } });
  });
});

describe("end rules: deciding the screen on submit", () => {
  const submit = (answers: Record<string, unknown>, language?: string) =>
    submitResponse(SHARE, answers as never, undefined, language);

  const storedRuleId = async () => (await prisma.response.findFirstOrThrow()).endRuleId;

  beforeEach(async () => {
    await save({
      defaultLanguage: "uk",
      languages: ["en"],
      endRules: [high, pro],
      endScreen: { text: "Thanks", redirectUrl: "https://example.com/default" },
      translations: { en: { endText: "Thanks (en)", endRules: { high: "Great (en)!" } } },
    });
  });

  it("returns the screen of the first matching rule and stores which rule it was", async () => {
    const result = await submit({ "q-score": 9, "q-choice": "o-pro" });

    expect(result.endScreen).toEqual({ text: "Great!", redirectUrl: "https://example.com/great" });
    expect(await storedRuleId()).toBe("high");
  });

  it("goes on to the next rule when the first does not hold", async () => {
    const result = await submit({ "q-score": 6, "q-choice": "o-pro" });

    expect(result.endScreen).toEqual({ text: "Welcome, Pro" });
    expect(await storedRuleId()).toBe("pro");
  });

  it("falls back to the form's own screen, and stores no rule", async () => {
    const result = await submit({ "q-score": 2 });

    expect(result.endScreen).toEqual({
      text: "Thanks",
      redirectUrl: "https://example.com/default",
    });
    expect(await storedRuleId()).toBeNull();
  });

  it("does not match on the answer of a question hidden by its own condition", async () => {
    // q-choice is hidden at score 2; a client that sends an answer for it anyway is not believed.
    const result = await submit({ "q-score": 2, "q-choice": "o-pro" });

    expect(result.endScreen?.text).toBe("Thanks");
    expect(await storedRuleId()).toBeNull();
  });

  it("answers in the respondent's language", async () => {
    expect((await submit({ "q-score": 9 }, "en")).endScreen?.text).toBe("Great (en)!");
    expect((await submit({ "q-score": 2 }, "en")).endScreen?.text).toBe("Thanks (en)");
  });

  it("returns no screen for a form without rules and screen", async () => {
    await save({ endRules: null, endScreen: null, translations: null });

    expect((await submit({ "q-score": 9 })).endScreen).toBeNull();
    expect(await storedRuleId()).toBeNull();
  });
});

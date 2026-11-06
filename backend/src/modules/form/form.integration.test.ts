import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@quorvia/shared-types";

// Optimistic locking of a form on a REAL Prisma + Postgres (PGlite): a mocked transaction
// would not prove that the conditional UPDATE really rejects a stale client and that questions
// stay untouched after a conflict.
vi.mock("../../prisma/prisma.js", async () =>
  (await import("../../test/createTestPrisma.js")).createTestPrisma(),
);

const { prisma } = await import("../../prisma/prisma.js");
const { updateForm, getUserForm, duplicateForm } = await import("./form.service.js");

const USER = "user-1";
const FORM = "form-1";

const q = (id: string, text: string, order: number) => ({
  id,
  text,
  type: "TEXT" as const,
  order,
  required: false,
});

const save = (version: number | undefined, title: string, questions = [q("q1", "Перше", 0)]) =>
  updateForm(FORM, USER, { title, questions, version } as never);

const readForm = () => prisma.form.findUniqueOrThrow({ where: { id: FORM }, include: { questions: true } });

beforeEach(async () => {
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: USER, email: "a@b.c", password: "x" } });
  await prisma.form.create({
    data: {
      id: FORM,
      title: "Початкова",
      userId: USER,
      shareId: "share-1",
      questions: { create: [{ id: "q1", text: "Перше", type: "TEXT", order: 0 }] },
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("updateForm - optimistic locking", () => {
  it("нова форма має version = 1, а успішне збереження збільшує її і повертає нову", async () => {
    expect((await readForm()).version).toBe(1);

    const result = await save(1, "Друга");

    expect(result).toEqual({ success: true, version: 2 });
    expect((await readForm()).version).toBe(2);
  });

  it("послідовні збереження з актуальною версією проходять", async () => {
    const first = await save(1, "A");
    const second = await save(first.version, "B");

    expect(second.version).toBe(3);
    expect((await readForm()).title).toBe("B");
  });

  it("застарілий редактор отримує 409 і НЕ затирає чужі зміни", async () => {
    // Two editors opened the form at version 1.
    await save(1, "Зміна з вкладки A", [q("q1", "Перше", 0), q("q2", "Додане в A", 1)]);

    await expect(save(1, "Зміна з вкладки B", [q("q1", "Перше (B)", 0)])).rejects.toMatchObject({
      message: ErrorCode.FORM_VERSION_CONFLICT,
      statusCode: 409,
    });

    const form = await readForm();
    expect(form.title).toBe("Зміна з вкладки A");
    expect(form.version).toBe(2);
    // q2 from tab A is not deleted and q1 is not renamed by B's changes
    expect(form.questions.map((x) => x.id).sort()).toEqual(["q1", "q2"]);
    expect(form.questions.find((x) => x.id === "q1")?.text).toBe("Перше");
  });

  it("два одночасні збереження з тією самою версією: рівно одне проходить, інше - 409", async () => {
    const results = await Promise.allSettled([save(1, "A"), save(1, "B")]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ message: ErrorCode.FORM_VERSION_CONFLICT });
    expect((await readForm()).version).toBe(2);
  });

  it("запит без version використовує поточну версію і теж збільшує її", async () => {
    const result = await save(undefined, "Без version");

    expect(result.version).toBe(2);
  });

  it("помилка валідації (400) не збільшує версію", async () => {
    await expect(
      save(1, "Цикл", [
        {
          ...q("q1", "Перше", 0),
          condition: { logic: "AND", rules: [{ questionId: "q1", operator: "equals", value: "x" }] },
        } as never,
      ]),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect((await readForm()).version).toBe(1);
  });

  it("getUserForm віддає version, а дубль форми починає з 1", async () => {
    await save(1, "A");

    const form = await getUserForm(FORM, USER);
    expect(form.version).toBe(2);

    const copy = await duplicateForm(FORM, USER);
    expect(copy.version).toBe(1);
  });
});

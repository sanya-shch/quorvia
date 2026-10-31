import { describe, expect, it, vi } from "vitest";
import { paginate, type PageArgs } from "./paginate.js";

/** Fake-джерело, що поводиться як Prisma findMany з cursor/skip/take. */
const source = (n: number) => {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `id-${String(i).padStart(3, "0")}` }));
  return vi.fn(async ({ take, skip = 0, cursor }: PageArgs) => {
    const start = cursor ? rows.findIndex((r) => r.id === cursor.id) + skip : 0;
    return rows.slice(start, start + take);
  });
};

const collect = async (fetch: ReturnType<typeof source>, size: number) => {
  const batches: string[][] = [];
  for await (const batch of paginate(fetch, size)) batches.push(batch.map((r) => r.id));
  return batches;
};

describe("paginate", () => {
  it("віддає всі рядки рівно один раз, порціями заданого розміру", async () => {
    const batches = await collect(source(7), 3);

    expect(batches.map((b) => b.length)).toEqual([3, 3, 1]);
    expect(batches.flat()).toHaveLength(7);
    expect(new Set(batches.flat()).size).toBe(7);
  });

  it("порожня вибірка - жодної порції, один запит", async () => {
    const fetch = source(0);

    expect(await collect(fetch, 5)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("кількість рядків, кратна розміру порції, закінчується порожнім запитом і без дублів", async () => {
    const fetch = source(6);
    const batches = await collect(fetch, 3);

    expect(batches.map((b) => b.length)).toEqual([3, 3]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("перший запит без курсора, наступні - з курсором на останній id і skip: 1", async () => {
    const fetch = source(5);
    await collect(fetch, 2);

    expect(fetch).toHaveBeenNthCalledWith(1, { take: 2 });
    expect(fetch).toHaveBeenNthCalledWith(2, { take: 2, skip: 1, cursor: { id: "id-001" } });
    expect(fetch).toHaveBeenNthCalledWith(3, { take: 2, skip: 1, cursor: { id: "id-003" } });
  });

  it("не читає наступну порцію, поки споживач не попросить (lazy)", async () => {
    const fetch = source(10);
    const it = paginate(fetch, 2);

    await it.next();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("кидає помилку замість безкінечного циклу, якщо курсор не просувається", async () => {
    const stuck = vi.fn(async () => [{ id: "a" }, { id: "b" }]);

    await expect(collect(stuck as unknown as ReturnType<typeof source>, 2)).rejects.toThrow(
      /курсор не просунувся/,
    );
  });
});

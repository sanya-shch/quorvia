/**
 * Keyset walk of a large result set in batches.
 *
 * Analytics must not hold every response of a form in memory: the aggregation functions
 * accumulate incrementally anyway, so they only need to see one batch at a time. Memory is
 * bounded by the batch size, and between batches the Node.js event loop is free for other
 * requests.
 *
 * `fetchPage` must order rows deterministically (by a unique key) and accept a Prisma
 * cursor: `{ take, skip, cursor }`.
 */
export type PageArgs = { take: number; skip?: number; cursor?: { id: string } };

export async function* paginate<T extends { id: string }>(
  fetchPage: (page: PageArgs) => Promise<T[]>,
  size: number,
): AsyncGenerator<T[]> {
  let cursorId: string | undefined;

  for (;;) {
    const rows = await fetchPage(
      cursorId ? { take: size, skip: 1, cursor: { id: cursorId } } : { take: size },
    );

    if (rows.length === 0) return;
    yield rows;
    if (rows.length < size) return;

    const nextCursorId = rows[rows.length - 1].id;
    // Safety net: if the cursor did not advance (a bug in fetchPage, for example an inclusive
    // cursor without skip), the loop would read the same batch forever.
    if (nextCursorId === cursorId) {
      throw new Error("paginate: курсор не просунувся - fetchPage повертає ту саму порцію");
    }
    cursorId = nextCursorId;
  }
}

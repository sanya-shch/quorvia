/**
 * Keyset-обхід великої вибірки порціями.
 *
 * Аналітика не повинна тримати в пам'яті всі відповіді форми: функції
 * агрегації й так накопичують результат інкрементально, тож їм достатньо
 * бачити по одній порції. Пам'ять обмежується розміром порції, а між
 * порціями подія-цикл Node.js вільний для інших запитів.
 *
 * `fetchPage` має впорядковувати рядки детерміновано (унікальним ключем) і
 * приймати Prisma-курсор: `{ take, skip, cursor }`.
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
    // Запобіжник: якщо курсор не просунувся (помилка в fetchPage, наприклад
    // курсор включно без skip), цикл читав би ту саму порцію безкінечно.
    if (nextCursorId === cursorId) {
      throw new Error("paginate: курсор не просунувся - fetchPage повертає ту саму порцію");
    }
    cursorId = nextCursorId;
  }
}

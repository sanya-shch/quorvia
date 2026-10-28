export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 100;
export const MAX_PAGE = 100_000;

const toPositiveInt = (value: unknown): number | null => {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;

  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
};

/**
 * Безпечний розбір ?page=&limit=. Раніше `Number(req.query.limit) || 10`
 * пропускало limit=1000000 (вигрузка всієї таблиці одним запитом) та
 * від'ємний/дробовий page (негативний skip -> помилка Prisma -> 500).
 * Некоректні значення мовчки замінюються дефолтами, завищені - обрізаються.
 */
export const parsePagination = (query: { page?: unknown; limit?: unknown }) => ({
  page: Math.min(toPositiveInt(query.page) ?? 1, MAX_PAGE),
  limit: Math.min(toPositiveInt(query.limit) ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT),
});

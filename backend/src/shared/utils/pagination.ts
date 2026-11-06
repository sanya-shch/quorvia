export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 100;
export const MAX_PAGE = 100_000;

const toPositiveInt = (value: unknown): number | null => {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;

  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
};

/**
 * Safe parsing of ?page=&limit=. `Number(req.query.limit) || 10` used to let through
 * limit=1000000 (dumping the whole table in one request) and a negative/fractional page
 * (negative skip -> Prisma error -> 500). Invalid values are silently replaced with
 * defaults, oversized ones are clamped.
 */
export const parsePagination = (query: { page?: unknown; limit?: unknown }) => ({
  page: Math.min(toPositiveInt(query.page) ?? 1, MAX_PAGE),
  limit: Math.min(toPositiveInt(query.limit) ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT),
});

import { describe, expect, it } from "vitest";
import { MAX_PAGE, MAX_PAGE_LIMIT, parsePagination } from "./pagination.js";

describe("parsePagination", () => {
  it("дефолти: page=1, limit=10", () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 10 });
  });

  it("приймає коректні значення (рядки з query)", () => {
    expect(parsePagination({ page: "3", limit: "25" })).toEqual({ page: 3, limit: 25 });
  });

  it("обрізає завеликий limit і page", () => {
    expect(parsePagination({ page: "99999999", limit: "1000000" })).toEqual({
      page: MAX_PAGE,
      limit: MAX_PAGE_LIMIT,
    });
  });

  it.each(["0", "-5", "abc", "1.5", "", "NaN"])("некоректне значення %j замінюється дефолтом", (v) => {
    expect(parsePagination({ page: v, limit: v })).toEqual({ page: 1, limit: 10 });
  });

  it("масив у query (?page=1&page=2) не ламає розбір", () => {
    expect(parsePagination({ page: ["1", "2"], limit: ["5"] })).toEqual({ page: 1, limit: 10 });
  });
});

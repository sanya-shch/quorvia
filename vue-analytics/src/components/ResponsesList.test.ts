import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { ResponseListDto, ResponseScoreDto } from "@quorvia/shared-types";
import { createAnalyticsI18n } from "../i18n";
import ResponsesList from "./ResponsesList.vue";

const score = (overrides: Partial<ResponseScoreDto> = {}): ResponseScoreDto => ({
  score: 15,
  maxScore: 20,
  percent: 75,
  categoryId: "high",
  categoryLabel: "Експерт",
  ...overrides,
});

const list = (...scores: (ResponseScoreDto | null | undefined)[]): ResponseListDto => ({
  total: scores.length,
  page: 1,
  limit: 20,
  data: scores.map((s, i) => ({
    id: `r-${i}`,
    createdAt: "2026-01-15T10:00:00.000Z",
    language: null,
    ...(s === undefined ? {} : { score: s }),
  })),
});

const render = (data: ResponseListDto, locale = "uk") =>
  mount(ResponsesList, {
    props: { data, isLoading: false, error: null, page: 1, selectedResponseId: null },
    global: { plugins: [createAnalyticsI18n(locale)] },
  });

describe("ResponsesList with scores", () => {
  it("shows the score, the maximum and the category next to a scored response", () => {
    expect(render(list(score())).get('[data-test="item-score"]').text()).toBe("15 з 20 · Експерт");
  });

  it("writes it in the page's language", () => {
    expect(
      render(list(score({ score: 7.5 })), "en")
        .get('[data-test="item-score"]')
        .text(),
    ).toBe("7.5 of 20 · Експерт");
    expect(
      render(list(score({ score: 7.5 })))
        .get('[data-test="item-score"]')
        .text(),
    ).toContain("7,5 з 20");
  });

  it("leaves out the maximum and the category when there are none", () => {
    expect(
      render(list(score({ maxScore: null, categoryId: null, categoryLabel: null })))
        .get('[data-test="item-score"]')
        .text(),
    ).toBe("15");
  });

  it("keeps a score of 0", () => {
    expect(
      render(list(score({ score: 0, categoryLabel: null })))
        .get('[data-test="item-score"]')
        .text(),
    ).toBe("0 з 20");
  });

  it("shows nothing for a response that was not scored, or from a server that does not score", () => {
    const wrapper = render(list(null, undefined, score()));

    expect(wrapper.findAll('[data-test="item-score"]')).toHaveLength(1);
  });
});

describe("ResponsesList: поява рядків", () => {
  it("рядки зʼявляються каскадом: порядковий номер у --motion-index", () => {
    const items = render(list(undefined, undefined, undefined)).findAll(".item");

    expect(items).toHaveLength(3);
    items.forEach((item, index) => {
      expect(item.classes()).toContain("va-reveal");
      expect(item.attributes("style")).toContain(`--motion-index: ${index}`);
    });
  });
});

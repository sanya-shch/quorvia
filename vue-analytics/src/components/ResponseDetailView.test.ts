import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { ResponseDetailsDto, ResponseScoreDto } from "@quorvia/shared-types";
import { createAnalyticsI18n } from "../i18n";
import ResponseDetailView from "./ResponseDetailView.vue";

const detail = (score?: ResponseScoreDto | null): ResponseDetailsDto => ({
  id: "r-1",
  formId: "f-1",
  createdAt: "2026-01-15T10:00:00.000Z",
  language: null,
  answers: [],
  ...(score === undefined ? {} : { score }),
});

const render = (data: ResponseDetailsDto, locale = "uk") =>
  mount(ResponseDetailView, {
    props: { data, isLoading: false, error: null, apiBaseUrl: "http://api.test" },
    global: { plugins: [createAnalyticsI18n(locale)] },
  });

const score = (overrides: Partial<ResponseScoreDto> = {}): ResponseScoreDto => ({
  score: 15,
  maxScore: 20,
  percent: 75,
  categoryId: "high",
  categoryLabel: "Експерт",
  ...overrides,
});

describe("ResponseDetailView with a score", () => {
  it("shows the score, the maximum, the percentage and the category", () => {
    expect(render(detail(score())).get('[data-test="detail-score"]').text()).toBe(
      "Бали: 15 з 20 (75%) · Експерт",
    );
  });

  it("writes it in English too", () => {
    expect(
      render(detail(score({ score: 7.5, percent: 37.5 })), "en")
        .get('[data-test="detail-score"]')
        .text(),
    ).toBe("Score: 7.5 of 20 (37.5%) · Експерт");
  });

  it("leaves out what is not there", () => {
    expect(
      render(
        detail(score({ maxScore: null, percent: null, categoryId: null, categoryLabel: null })),
      )
        .get('[data-test="detail-score"]')
        .text(),
    ).toBe("Бали: 15");
  });

  it("shows nothing for a response that was not scored", () => {
    expect(render(detail(null)).find('[data-test="detail-score"]').exists()).toBe(false);
    expect(render(detail()).find('[data-test="detail-score"]').exists()).toBe(false);
  });
});

describe("ResponseDetailView: перемикання між відповідями", () => {
  const mountWith = (props: { data: ResponseDetailsDto | null; isLoading: boolean }) =>
    mount(ResponseDetailView, {
      props: { error: null, apiBaseUrl: "http://api.test", ...props },
      global: { plugins: [createAnalyticsI18n("en")] },
    });

  it("перше відкриття: лоадер з відкладеною появою, без контенту", () => {
    const wrapper = mountWith({ data: null, isLoading: true });

    expect(wrapper.find(".state-card--delayed").exists()).toBe(true);
    expect(wrapper.find(".detail").exists()).toBe(false);
  });

  it("наступна відповідь вантажиться: попередня лишається, не клікається й не підміняється лоадером", () => {
    const wrapper = mountWith({ data: detail(), isLoading: true });

    expect(wrapper.find(".state-card").exists()).toBe(false);
    const stale = wrapper.get(".detail");
    expect(stale.classes()).toContain("detail--stale");
    expect(stale.attributes("aria-busy")).toBe("true");
    expect(stale.attributes("inert")).toBeDefined();
  });

  it("завантажена відповідь: без приглушення та без inert", () => {
    const wrapper = mountWith({ data: detail(), isLoading: false });

    const current = wrapper.get(".detail");
    expect(current.classes()).not.toContain("detail--stale");
    expect(current.attributes("inert")).toBeUndefined();
    expect(current.attributes("aria-busy")).toBe("false");
  });

  it("елемент деталі не перемонтовується між відповідями (анімація появи грає лише раз)", async () => {
    const wrapper = mountWith({ data: detail(), isLoading: false });
    const before = wrapper.get(".detail").element;

    await wrapper.setProps({ isLoading: true });
    await wrapper.setProps({ data: { ...detail(), id: "r-2" }, isLoading: false });

    expect(wrapper.get(".detail").element).toBe(before);
    expect(wrapper.text()).toContain("r-2");
  });
});

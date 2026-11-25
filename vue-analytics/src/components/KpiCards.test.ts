import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { AnalyticsPeriodTotals, AnalyticsSummaryDto } from "@quorvia/shared-types";
import { createAnalyticsI18n } from "../i18n";
import KpiCards from "./KpiCards.vue";

const totals = (o: Partial<AnalyticsPeriodTotals>): AnalyticsPeriodTotals => ({
  responses: 0,
  started: 0,
  completed: 0,
  abandoned: 0,
  completionRate: 0,
  medianCompletionSeconds: null,
  ...o,
});

const summary = (current: AnalyticsPeriodTotals, previous: AnalyticsPeriodTotals | null) =>
  ({ period: { from: null, to: null }, current, previous, daily: [] }) as AnalyticsSummaryDto;

const render = (s: AnalyticsSummaryDto | null, error: string | null = null) =>
  mount(KpiCards, {
    props: { summary: s, isLoading: false, error },
    global: { plugins: [createAnalyticsI18n("en")] },
  });

describe("KpiCards", () => {
  it("чотири картки зі значеннями й порівнянням із попереднім періодом", () => {
    const wrapper = render(
      summary(
        totals({
          responses: 112,
          started: 131,
          completed: 112,
          abandoned: 19,
          completionRate: 0.855,
        }),
        totals({
          responses: 100,
          started: 130,
          completed: 100,
          abandoned: 30,
          completionRate: 0.77,
        }),
      ),
    );

    const cards = wrapper.findAll(".card");
    expect(cards).toHaveLength(4);
    expect(cards[0].text()).toContain("112");
    expect(cards[0].text()).toContain("+12.0% vs. prior period");
    expect(cards[2].text()).toContain("85.5%");
    expect(cards[2].text()).toContain("+8.5 pts");
    expect(cards[3].text()).toContain("14.5% of started attempts");
  });

  it("картки з'являються каскадом: порядковий номер у --motion-index", () => {
    const wrapper = render(summary(totals({ responses: 5, started: 5 }), null));

    const indexes = wrapper.findAll(".card").map((card) => card.attributes("style"));
    expect(indexes).toEqual([
      expect.stringContaining("--motion-index: 0"),
      expect.stringContaining("--motion-index: 1"),
      expect.stringContaining("--motion-index: 2"),
      expect.stringContaining("--motion-index: 3"),
    ]);
  });

  it("без попереднього періоду пише 'за весь час', а не вигадані зміни", () => {
    const wrapper = render(summary(totals({ responses: 5, started: 5 }), null));

    expect(wrapper.findAll(".card")[0].text()).toContain("All time");
  });

  it("якщо раніше нічого не було - 'немає даних', а не нескінченні відсотки", () => {
    const wrapper = render(summary(totals({ responses: 5 }), totals({ responses: 0 })));

    expect(wrapper.findAll(".card")[0].text()).toContain("No data in the prior period");
  });

  it("покинуті спроби завжди червоні, спад відповідей - теж", () => {
    const wrapper = render(
      summary(totals({ responses: 5, abandoned: 2, started: 7 }), totals({ responses: 10 })),
    );

    expect(wrapper.findAll(".delta--down").length).toBeGreaterThan(0);
    expect(wrapper.findAll(".card")[3].find(".delta--bad").exists()).toBe(true);
  });

  it("помилка показується замість карток", () => {
    const wrapper = render(null, "analytics.errors.summaryLoadFailed");

    expect(wrapper.find("[role=alert]").text()).toBe("Failed to load the summary numbers.");
    expect(wrapper.findAll(".card")).toHaveLength(0);
  });
});

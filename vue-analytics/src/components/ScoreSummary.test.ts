import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { ScoreAnalyticsDto } from "@quorvia/shared-types";
import { createAnalyticsI18n } from "../i18n";
import ScoreSummary from "./ScoreSummary.vue";

const histogram = (counts: number[]) =>
  counts.map((count, i) => ({ fromPercent: i * 10, toPercent: (i + 1) * 10, count }));

const scoring = (overrides: Partial<ScoreAnalyticsDto> = {}): ScoreAnalyticsDto => ({
  enabled: true,
  scoredCount: 4,
  average: 3.25,
  min: 0,
  max: 8,
  averagePercent: 40.63,
  histogram: histogram([1, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  categories: [
    { id: "low", label: "Початківець", min: 0, max: 3, count: 2 },
    { id: "high", label: "Експерт", min: 4, max: 10, count: 1 },
  ],
  uncategorizedCount: 1,
  ...overrides,
});

const render = (data: ScoreAnalyticsDto, locale = "uk") =>
  mount(ScoreSummary, {
    props: { scoring: data },
    global: { plugins: [createAnalyticsI18n(locale)] },
  });

const text = (wrapper: ReturnType<typeof render>, test: string) =>
  wrapper.get(`[data-test="${test}"]`).text();

describe("ScoreSummary", () => {
  it("shows how many responses were scored, the average and the range", () => {
    const wrapper = render(scoring());

    expect(text(wrapper, "scored-count")).toBe("4");
    // Ukrainian writes the decimal sign as a comma.
    expect(text(wrapper, "average")).toBe("3,25");
    expect(text(wrapper, "average-percent")).toBe("40,63%");
    expect(text(wrapper, "range")).toBe("0–8");
  });

  it("writes numbers the way the page's language does", () => {
    expect(text(render(scoring(), "en"), "average")).toBe("3.25");
  });

  it("leaves out the average percentage when there is none", () => {
    expect(
      render(scoring({ averagePercent: null }))
        .find('[data-test="average-percent"]')
        .exists(),
    ).toBe(false);
  });

  it("draws ten buckets, the tallest at full height and the empty ones flat", () => {
    const buckets = render(
      scoring({ histogram: histogram([2, 1, 0, 0, 0, 0, 0, 0, 0, 4]) }),
    ).findAll('[data-test="bucket"]');

    expect(buckets).toHaveLength(10);

    const height = (i: number) => buckets[i]!.get(".bucket-bar").attributes("style");

    expect(height(9)).toContain("height: 100%");
    expect(height(0)).toContain("height: 50%");
    expect(height(1)).toContain("height: 25%");
    expect(height(4)).toContain("height: 0%");
  });

  it("names every bucket for a screen reader or a tooltip", () => {
    const first = render(scoring({ histogram: histogram([3, 0, 0, 0, 0, 0, 0, 0, 0, 0]) })).findAll(
      '[data-test="bucket"]',
    )[0]!;

    expect(first.attributes("title")).toBe("0–10%: 3");
  });

  it("does not divide by zero when every bucket is empty", () => {
    const buckets = render(scoring({ histogram: histogram(Array(10).fill(0)) })).findAll(
      '[data-test="bucket"]',
    );

    expect(
      buckets.every((b) => b.get(".bucket-bar").attributes("style")?.includes("height: 0%")),
    ).toBe(true);
  });

  it("lists the categories with their range, count and share, then the responses in none", () => {
    const rows = render(scoring()).findAll('[data-test="category"]');

    expect(rows).toHaveLength(3);
    expect(rows[0]!.text()).toContain("Початківець");
    expect(rows[0]!.text()).toContain("0–3");
    expect(rows[0]!.text()).toContain("2 (50%)");
    expect(rows[1]!.text()).toContain("Експерт");
    expect(rows[1]!.text()).toContain("1 (25%)");
    expect(rows[2]!.text()).toContain("Без категорії");
    expect(rows[2]!.text()).toContain("1 (25%)");
    expect(rows[0]!.get(".category-fill").attributes("style")).toContain("width: 50%");
  });

  it("shows no 'no category' row when every response has a category", () => {
    const rows = render(scoring({ uncategorizedCount: 0 })).findAll('[data-test="category"]');

    expect(rows.map((r) => r.text()).join(" ")).not.toContain("Без категорії");
  });

  it("shows no categories section for a form without categories and without strays", () => {
    const wrapper = render(scoring({ categories: [], uncategorizedCount: 0 }));

    expect(wrapper.findAll('[data-test="category"]')).toHaveLength(0);
    expect(wrapper.text()).not.toContain("Категорії");
  });

  it("says there is nothing yet for a form that scores but has no scored responses", () => {
    const wrapper = render(
      scoring({
        scoredCount: 0,
        average: 0,
        min: 0,
        max: 0,
        averagePercent: null,
        histogram: histogram(Array(10).fill(0)),
      }),
    );

    expect(text(wrapper, "empty")).toContain("Поки немає відповідей із балами");
    expect(wrapper.find('[data-test="scored-count"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-test="bucket"]')).toHaveLength(0);
  });

  it("warns that scoring is off now, while still showing the scored responses", () => {
    const wrapper = render(scoring({ enabled: false }));

    expect(text(wrapper, "disabled-note")).toContain("вимкнено");
    expect(text(wrapper, "scored-count")).toBe("4");
  });

  it("has no warning while scoring is on", () => {
    expect(render(scoring()).find('[data-test="disabled-note"]').exists()).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { QuestionOverview } from "@quorvia/shared-types";
import { createAnalyticsI18n } from "../i18n";
import QuestionOverviewCard from "./QuestionOverviewCard.vue";

const render = (question: QuestionOverview) =>
  mount(QuestionOverviewCard, {
    props: { question, totalResponses: 10 },
    global: { plugins: [createAnalyticsI18n("uk")] },
  });

const calculation = (overrides: Partial<QuestionOverview> = {}): QuestionOverview => ({
  id: "total",
  text: "Разом",
  type: "CALCULATION",
  resultType: "number",
  ...overrides,
});

describe("QuestionOverviewCard - calculation field", () => {
  it("summarizes a number result: average with two decimals, min and max", () => {
    const wrapper = render(calculation({ stats: { avg: 1234.5678, min: 10, max: 8548.67 } }));
    const values = wrapper.findAll(".stat-value").map((v) => v.text());

    // Ukrainian does not group four digits; the average keeps two decimals (a price).
    expect(values[0]).toBe("1234.57");
    expect(values.slice(1)).toEqual(["10", "8548.67"]);
  });

  it("is not clickable: there is no detail view for a computed value", async () => {
    const wrapper = render(calculation({ stats: { avg: 1, min: 1, max: 1 } }));
    const button = wrapper.get("button");

    expect(button.attributes("disabled")).toBeDefined();
    expect(button.classes()).toContain("card--static");

    await button.trigger("click");

    expect(wrapper.emitted("open-detail")).toBeUndefined();
  });

  it("says there are no numbers to summarize for a text or yes/no result", () => {
    const wrapper = render(calculation({ resultType: "string" }));

    expect(wrapper.text()).toContain("Результат — текст або «так / ні»");
  });

  it("says there are no answers yet for a number result without values", () => {
    const wrapper = render(calculation());

    expect(wrapper.text()).toContain("Немає відповідей");
    expect(wrapper.text()).not.toContain("текст або");
  });

  it("a plain number question is unchanged: one decimal and still clickable", async () => {
    const wrapper = render({
      id: "n",
      text: "Вік",
      type: "NUMBER",
      stats: { avg: 33.456, min: 18, max: 60 },
    });

    expect(wrapper.get(".stat-value").text()).toBe("33.5");

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("open-detail")).toEqual([["n"]]);
  });
});

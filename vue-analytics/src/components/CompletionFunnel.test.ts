import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { FormFunnelDto } from "@quorvia/shared-types";
import { createAnalyticsI18n } from "../i18n";
import CompletionFunnel from "./CompletionFunnel.vue";

const node = (i: number, reached: number, exited: number) => ({
  questionId: `q${i}`,
  text: `Питання ${i}`,
  order: i - 1,
  reachedCount: reached,
  exitedCount: exited,
});

const funnel = (overrides: Partial<FormFunnelDto> = {}): FormFunnelDto => ({
  totalAttempts: 100,
  totalCompletions: 60,
  completionRate: 0.6,
  medianCompletionSeconds: 134,
  nodes: [node(1, 100, 10), node(2, 90, 30), node(3, 60, 0)],
  ...overrides,
});

const render = (data: FormFunnelDto, inspectableIds: string[] = []) =>
  mount(CompletionFunnel, {
    props: { funnel: data, inspectableIds },
    global: { plugins: [createAnalyticsI18n("uk")] },
  });

describe("CompletionFunnel", () => {
  it("показує розпочато / надіслано / медіанний час", () => {
    const text = render(funnel()).text();

    expect(text).toContain("100");
    expect(text).toContain("60.0%");
    expect(text).toContain("2m 14s");
  });

  it("позначає питання з найбільшим відтоком і називає його у 'найбільше труднощів'", () => {
    const wrapper = render(funnel());

    expect(wrapper.findAll(".tr--highest")).toHaveLength(1);
    expect(wrapper.find(".tr--highest").text()).toContain("Питання 2");
    expect(wrapper.find(".tile--accent").text()).toContain("Q2");
  });

  it("при однакових максимумах позначка лише на першому", () => {
    const wrapper = render(funnel({ nodes: [node(1, 100, 20), node(2, 80, 20), node(3, 60, 0)] }));

    expect(wrapper.findAll(".flag")).toHaveLength(1);
    expect(wrapper.find(".tr--highest").text()).toContain("Питання 1");
  });

  it("зберігає 'втрату відносно попереднього питання'", () => {
    const wrapper = render(funnel());

    // 100 -> 90: 10 lost before question 2.
    expect(wrapper.findAll(".tr")[1].find(".lost").exists()).toBe(true);
    expect(wrapper.findAll(".tr")[0].find(".lost").exists()).toBe(false);
  });

  it("сортування 'найбільший відтік' змінює порядок рядків", async () => {
    const wrapper = render(funnel());
    const order = () => wrapper.findAll(".qtext").map((e) => e.text());

    expect(order()).toEqual(["Питання 1", "Питання 2", "Питання 3"]);

    await wrapper.find(".sort").trigger("click");

    expect(order()).toEqual(["Питання 2", "Питання 1", "Питання 3"]);
  });

  it("лише питання з деталями - посилання, і воно відкриває деталі", async () => {
    const wrapper = render(funnel(), ["q2"]);

    expect(wrapper.findAll(".qtext--link")).toHaveLength(1);
    await wrapper.find(".qtext--link").trigger("click");

    expect(wrapper.emitted("open-question")).toEqual([["q2"]]);
  });

  it("довгий список згорнутий до 8 рядків, 'усі питання' розгортає", async () => {
    const nodes = Array.from({ length: 11 }, (_, i) => node(i + 1, 100 - i, 0));
    const wrapper = render(funnel({ nodes }));

    expect(wrapper.findAll(".tr")).toHaveLength(8);
    await wrapper.find(".more").trigger("click");
    expect(wrapper.findAll(".tr")).toHaveLength(11);
  });

  it("без спроб - порожній стан, без таблиці", () => {
    const wrapper = render(
      funnel({ totalAttempts: 0, totalCompletions: 0, nodes: [node(1, 0, 0)] }),
    );

    expect(wrapper.find(".empty").exists()).toBe(true);
    expect(wrapper.find(".table").exists()).toBe(false);
  });

  it("без часу заповнення показує прочерк", () => {
    expect(render(funnel({ medianCompletionSeconds: null })).text()).toContain("-");
  });
});

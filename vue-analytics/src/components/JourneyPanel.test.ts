import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import type { FormJourneysDto, JourneyNode } from "@quorvia/shared-types";
import { apiGet } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, apiGet: vi.fn() };
});

import { createAnalyticsI18n } from "../i18n";
import JourneyPanel from "./JourneyPanel.vue";

const mockedApiGet = vi.mocked(apiGet);

const node = (
  id: string,
  kind: JourneyNode["kind"],
  column: number,
  count: number,
  order: number | null = null,
  text: string | null = null,
): JourneyNode => ({
  id,
  kind,
  column,
  questionId: kind === "question" || kind === "exit" ? `id-${id.split(":").pop()}` : null,
  text,
  order,
  count,
});

const journeys: FormJourneysDto = {
  status: "all",
  steps: 6,
  totalAttempts: 100,
  columns: 3,
  nodes: [
    node("start", "start", 0, 100),
    node("q1:a", "question", 1, 100, 0, "Перше"),
    node("exit:q1:a", "exit", 2, 40, 0, "Перше"),
    node("submitted", "submitted", 2, 60),
    node("exit:start", "exit", 1, 2),
  ],
  links: [
    { source: "start", target: "q1:a", count: 98 },
    { source: "start", target: "exit:start", count: 2 },
    { source: "q1:a", target: "exit:q1:a", count: 40 },
    { source: "q1:a", target: "submitted", count: 58 },
  ],
};

const render = (periodParams: Record<string, string> = { from: "2026-11-01", to: "2026-11-30" }) =>
  mount(JourneyPanel, {
    props: {
      apiBaseUrl: "http://api",
      formId: "f1",
      periodParams,
      paths: null,
      pathsLoading: false,
      pathsError: null,
      inspectableIds: ["id-a"],
    },
    global: { plugins: [createAnalyticsI18n("en")] },
  });

beforeEach(() => {
  mockedApiGet.mockReset();
  mockedApiGet.mockResolvedValue(journeys);
});

describe("JourneyPanel", () => {
  it("запитує карту з періодом і типовими фільтрами", async () => {
    render();
    await flushPromises();

    expect(mockedApiGet).toHaveBeenCalledWith(
      "http://api",
      "/forms/f1/analytics/journeys?from=2026-11-01&to=2026-11-30&status=all&steps=6",
    );
  });

  it("вузли - кнопки; вибір вузла показує огляд, звідки прийшли й куди пішли", async () => {
    const wrapper = render();
    await flushPromises();

    const nodes = wrapper.findAll(".node");
    expect(nodes.length).toBe(journeys.nodes.length);

    await wrapper.find(".node--question").trigger("click");

    const inspector = wrapper.find(".inspector").text();
    expect(inspector).toContain("100 reached");
    expect(inspector).toContain("40 exited");
    expect(inspector).toContain("58 continued");
    expect(wrapper.find(".node--question").attributes("aria-pressed")).toBe("true");
  });

  it("повторний клік знімає вибір; Escape теж", async () => {
    const wrapper = render();
    await flushPromises();
    const target = () => wrapper.find(".node--question");

    await target().trigger("click");
    await target().trigger("click");
    expect(target().attributes("aria-pressed")).toBe("false");

    await target().trigger("click");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(target().attributes("aria-pressed")).toBe("false");
  });

  it("'Відкрити аналітику питання' є лише для питань з деталями й відкриває їх", async () => {
    const wrapper = render();
    await flushPromises();

    await wrapper.find(".node--question").trigger("click");
    await wrapper.find(".inspect").trigger("click");

    expect(wrapper.emitted("open-question")).toEqual([["id-a"]]);
  });

  it("фільтр 'Покинуті' перезапитує карту зі status=abandoned", async () => {
    const wrapper = render();
    await flushPromises();

    await wrapper.findAll(".chip")[2].trigger("click");
    await flushPromises();

    expect(mockedApiGet).toHaveBeenLastCalledWith(
      "http://api",
      "/forms/f1/analytics/journeys?from=2026-11-01&to=2026-11-30&status=abandoned&steps=6",
    );
  });

  it("зміна періоду зверху перезавантажує карту", async () => {
    const wrapper = render();
    await flushPromises();

    await wrapper.setProps({ periodParams: { from: "2026-10-01", to: "2026-10-31" } });
    await flushPromises();

    expect(mockedApiGet).toHaveBeenLastCalledWith(
      "http://api",
      expect.stringContaining("from=2026-10-01&to=2026-10-31"),
    );
  });

  it("відсотки замість кількостей, а 'Скинути' повертає все як було", async () => {
    const wrapper = render();
    await flushPromises();
    const first = () => wrapper.find(".node--submitted .count strong").text();

    expect(first()).toBe("60");

    await wrapper.findAll(".modes .seg")[1].trigger("click");
    expect(first()).toBe("60.0%");

    await wrapper.find(".reset").trigger("click");
    expect(first()).toBe("60");
  });

  it("'Сховати рідкісні шляхи' прибирає вузли менше 3% і каже скільки", async () => {
    const wrapper = render();
    await flushPromises();
    expect(wrapper.findAll(".node")).toHaveLength(5);

    await wrapper.find(".toggle").trigger("click");

    expect(wrapper.findAll(".node")).toHaveLength(4); // exit:start (2%) is gone
    expect(wrapper.find(".hidden-note").text()).toContain("1");
  });

  it("масштаб міняється кроками і обмежений", async () => {
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find(".zoom-value").text()).toBe("100%");
    await wrapper.findAll(".zoom-btn")[1].trigger("click");
    expect(wrapper.find(".zoom-value").text()).toBe("125%");

    for (let i = 0; i < 5; i++) await wrapper.findAll(".zoom-btn")[1].trigger("click");
    expect(wrapper.find(".zoom-value").text()).toBe("150%");
    expect(wrapper.findAll(".zoom-btn")[1].attributes("disabled")).toBeDefined();
  });

  it("список кроків - той самий зміст без діаграми", async () => {
    const wrapper = render();
    await flushPromises();

    await wrapper.findAll(".views .seg")[1].trigger("click");

    expect(wrapper.find(".stage").exists()).toBe(false);
    expect(wrapper.findAll(".row").length).toBe(journeys.nodes.length);
  });

  it("без спроб - порожній стан замість діаграми", async () => {
    mockedApiGet.mockResolvedValue({
      ...journeys,
      totalAttempts: 0,
      nodes: [],
      links: [],
      columns: 1,
    });
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find(".empty").exists()).toBe(true);
  });

  it("класичний 'потік питань' лишається доступним і не вимагає фільтрів карти", async () => {
    const wrapper = mount(JourneyPanel, {
      props: {
        apiBaseUrl: "http://api",
        formId: "f1",
        periodParams: {},
        paths: { totalResponses: 3, nodes: [], edges: [] },
        pathsLoading: false,
        pathsError: null,
        inspectableIds: [],
      },
      global: { plugins: [createAnalyticsI18n("en")] },
    });
    await flushPromises();

    await wrapper.findAll(".views .seg")[2].trigger("click");

    expect(wrapper.find(".flow-hint").exists()).toBe(true);
    expect(wrapper.find(".chip").attributes("disabled")).toBeDefined();
  });
});

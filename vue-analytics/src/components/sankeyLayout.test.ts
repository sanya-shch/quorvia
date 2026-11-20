import { describe, expect, it } from "vitest";
import type { FormJourneysDto, JourneyNode } from "@quorvia/shared-types";
import { layoutJourney, type LayoutOptions } from "./sankeyLayout";

const node = (
  id: string,
  kind: JourneyNode["kind"],
  column: number,
  count: number,
  order: number | null = null,
): JourneyNode => ({ id, kind, column, questionId: null, text: id, order, count });

// start(10) -> q1(10) -> q2a(6) / q2b(3) ; 1 exits at q1 ; q2a -> submitted(6); q2b -> exit(3)
const data: FormJourneysDto = {
  status: "all",
  steps: 6,
  totalAttempts: 10,
  columns: 4,
  nodes: [
    node("start", "start", 0, 10),
    node("q1", "question", 1, 10, 0),
    node("q2a", "question", 2, 6, 1),
    node("q2b", "question", 2, 3, 2),
    node("exit:q1", "exit", 2, 1, 0),
    node("submitted", "submitted", 3, 6),
    node("exit:q2b", "exit", 3, 3, 2),
  ],
  links: [
    { source: "start", target: "q1", count: 10 },
    { source: "q1", target: "q2a", count: 6 },
    { source: "q1", target: "q2b", count: 3 },
    { source: "q1", target: "exit:q1", count: 1 },
    { source: "q2a", target: "submitted", count: 6 },
    { source: "q2b", target: "exit:q2b", count: 3 },
  ],
};

const options: LayoutOptions = {
  columnWidth: 200,
  nodeWidth: 150,
  height: 300,
  nodePadding: 12,
  minNodeHeight: 20,
  hideBelow: 0,
};

describe("layoutJourney", () => {
  it("колонки розташовані зліва направо з кроком columnWidth", () => {
    const layout = layoutJourney(data, options);
    const x = (id: string) => layout.nodes.find((n) => n.id === id)!.x;

    expect(x("start")).toBe(0);
    expect(x("q2a")).toBe(400);
    expect(layout.width).toBe(3 * 200 + 150);
  });

  it("вузли однієї колонки не перекриваються й вміщаються у висоту", () => {
    const layout = layoutJourney(data, options);

    for (const column of [0, 1, 2, 3]) {
      const nodes = layout.nodes.filter((n) => n.column === column).sort((a, b) => a.y - b.y);
      nodes.forEach((n, i) => {
        expect(n.y).toBeGreaterThanOrEqual(-0.001);
        expect(n.y + n.height).toBeLessThanOrEqual(layout.height + 0.001);
        if (i > 0) expect(n.y).toBeGreaterThanOrEqual(nodes[i - 1].y + nodes[i - 1].height);
      });
    }
  });

  it("висота вузла пропорційна кількості, але не менша за мінімум", () => {
    const layout = layoutJourney(data, { ...options, minNodeHeight: 40 });
    const h = (id: string) => layout.nodes.find((n) => n.id === id)!.height;

    expect(h("q2a")).toBeGreaterThan(h("q2b"));
    expect(h("exit:q1")).toBe(40);
  });

  it("у колонці виходи - внизу, після питань", () => {
    const layout = layoutJourney(data, options);
    const y = (id: string) => layout.nodes.find((n) => n.id === id)!.y;

    expect(y("exit:q1")).toBeGreaterThan(y("q2b"));
  });

  it("колонка з кількома питаннями - 'conditional', одне питання - 'main'", () => {
    const layout = layoutJourney(data, options);
    const route = (id: string) => layout.nodes.find((n) => n.id === id)!.route;

    expect(route("q1")).toBe("main");
    expect(route("q2a")).toBe("conditional");
    expect(route("q2b")).toBe("conditional");
  });

  it("стрічка має товщину, пропорційну кількості, і шлях між краями вузлів", () => {
    const layout = layoutJourney(data, options);
    const thick = (key: string) => layout.links.find((l) => l.key === key)!.thickness;

    expect(thick("q1>q2a")).toBeCloseTo(thick("q1>q2b") * 2, 5);
    expect(layout.links.find((l) => l.key === "q1>q2a")!.path).toMatch(/^M350,/);
  });

  it("hideBelow прибирає малі вузли разом зі стрічками, старт лишається", () => {
    const layout = layoutJourney(data, { ...options, hideBelow: 0.35 });
    const ids = layout.nodes.map((n) => n.id);

    expect(ids).toContain("start");
    expect(ids).not.toContain("exit:q1");
    expect(ids).not.toContain("q2b");
    expect(layout.hiddenNodes).toBe(3);
    expect(layout.links.every((l) => ids.includes(l.source) && ids.includes(l.target))).toBe(true);
  });

  it("порожні дані не ламають розкладку", () => {
    const layout = layoutJourney(
      { status: "all", steps: 6, totalAttempts: 0, columns: 1, nodes: [], links: [] },
      options,
    );

    expect(layout.nodes).toEqual([]);
    expect(layout.links).toEqual([]);
  });
});

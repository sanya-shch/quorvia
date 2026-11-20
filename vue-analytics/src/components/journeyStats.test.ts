import { describe, expect, it } from "vitest";
import type { FormJourneysDto, JourneyNode } from "@quorvia/shared-types";
import { describeNode, largestExit, nodeStats } from "./journeyStats";

const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

const n = (
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
  questionId: order === null ? null : `id-${id}`,
  text,
  order,
  count,
});

const data: FormJourneysDto = {
  status: "all",
  steps: 6,
  totalAttempts: 10,
  columns: 3,
  nodes: [
    n("start", "start", 0, 10),
    n("q1", "question", 1, 10, 0, "Перше"),
    n("exit:q1", "exit", 2, 4, 0, "Перше"),
    n("submitted", "submitted", 2, 6),
  ],
  links: [
    { source: "start", target: "q1", count: 10 },
    { source: "q1", target: "exit:q1", count: 4 },
    { source: "q1", target: "submitted", count: 6 },
  ],
};

describe("nodeStats", () => {
  it("вихід і продовження виводяться зі стрічок і разом дають кількість вузла", () => {
    const stats = nodeStats(data, "q1", t)!;

    expect(stats.reached).toBe(10);
    expect(stats.exited).toBe(4);
    expect(stats.continued).toBe(6);
    expect(stats.exited + stats.continued).toBe(stats.reached);
    expect(stats.shareOfAttempts).toBe(1);
  });

  it("звідки прийшли й куди пішли - за спаданням кількості", () => {
    const stats = nodeStats(data, "q1", t)!;

    expect(stats.inbound.map((f) => f.count)).toEqual([10]);
    expect(stats.outbound.map((f) => f.count)).toEqual([6, 4]);
  });

  it("для невідомого вузла - null; для кінцевого вузла виходів немає", () => {
    expect(nodeStats(data, "ghost", t)).toBeNull();
    expect(nodeStats(data, "submitted", t)).toMatchObject({ exited: 0, continued: 0 });
  });

  it("частка рахується від усіх спроб; без спроб - 0", () => {
    expect(nodeStats(data, "submitted", t)!.shareOfAttempts).toBeCloseTo(0.6);
    expect(nodeStats({ ...data, totalAttempts: 0 }, "q1", t)!.shareOfAttempts).toBe(0);
  });
});

describe("describeNode / largestExit", () => {
  it("питання підписується номером за порядком у формі", () => {
    expect(describeNode(data.nodes[1], t)).toEqual({ eyebrow: "Q1", title: "Перше" });
  });

  it("вихід на питанні називається за ним; вихід на старті - окремо", () => {
    expect(describeNode(data.nodes[2], t).eyebrow).toContain("analytics.journey.exitAt");
    expect(describeNode(n("exit:start", "exit", 1, 1), t).title).toBe(
      "analytics.journey.exitAtStart",
    );
  });

  it("найбільший вихід", () => {
    expect(largestExit(data)!.id).toBe("exit:q1");
    expect(largestExit({ ...data, nodes: [data.nodes[0]] })).toBeNull();
  });
});

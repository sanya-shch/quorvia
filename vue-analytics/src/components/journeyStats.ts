import type { FormJourneysDto, JourneyNode } from "@quorvia/shared-types";

type Translate = (key: string, params?: Record<string, unknown>) => string;

// "Q3": the question's place in the form (nodes carry the 0-based order).
export const questionNumber = (node: JourneyNode): string | null =>
  node.order === null ? null : `Q${node.order + 1}`;

// The text a node is shown with, in one place so the map, the step list and the inspector agree.
export const describeNode = (
  node: JourneyNode,
  t: Translate,
): { eyebrow: string; title: string } => {
  const number = questionNumber(node);
  const text = node.text || t("analytics.common.untitledQuestion");

  switch (node.kind) {
    case "start":
      return { eyebrow: t("analytics.journey.start"), title: t("analytics.journey.allAttempts") };
    case "submitted":
      return { eyebrow: t("analytics.journey.outcome"), title: t("analytics.journey.submitted") };
    case "more":
      return { eyebrow: t("analytics.journey.later"), title: t("analytics.journey.laterSteps") };
    case "exit":
      return {
        eyebrow: number
          ? t("analytics.journey.exitAt", { question: number })
          : t("analytics.journey.exit"),
        title: number ? text : t("analytics.journey.exitAtStart"),
      };
    default:
      return { eyebrow: number ?? t("analytics.journey.step", { step: node.column }), title: text };
  }
};

export interface NodeFlow {
  id: string;
  label: string;
  count: number;
}

export interface NodeStats {
  node: JourneyNode;
  reached: number;
  // Of all attempts of the (filtered) map, 0..1.
  shareOfAttempts: number;
  // Attempts that left right after this node without submitting; 0 for nodes that cannot be left.
  exited: number;
  // Attempts that went on to another step or submitted.
  continued: number;
  inbound: NodeFlow[];
  outbound: NodeFlow[];
}

// Everything the inspector shows about one node, derived from the links so it always agrees with
// the picture (no second source of truth).
export const nodeStats = (
  data: FormJourneysDto,
  nodeId: string,
  t: Translate,
): NodeStats | null => {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  if (!node) return null;

  const label = (id: string) => {
    const other = byId.get(id);
    if (!other) return id;
    const { eyebrow, title } = describeNode(other, t);
    return other.kind === "question" ? `${eyebrow} · ${title}` : `${eyebrow}: ${title}`;
  };
  const flows = (pick: "source" | "target", other: "source" | "target"): NodeFlow[] =>
    data.links
      .filter((l) => l[pick] === nodeId)
      .map((l) => ({ id: l[other], label: label(l[other]), count: l.count }))
      .sort((a, b) => b.count - a.count);

  const inbound = flows("target", "source");
  const outbound = flows("source", "target");
  const exited = outbound
    .filter((f) => byId.get(f.id)?.kind === "exit")
    .reduce((sum, f) => sum + f.count, 0);
  const left = outbound.reduce((sum, f) => sum + f.count, 0);

  return {
    node,
    reached: node.count,
    shareOfAttempts: data.totalAttempts > 0 ? node.count / data.totalAttempts : 0,
    exited,
    continued: left - exited,
    inbound,
    outbound,
  };
};

// The exit node with the most attempts: "where people give up most".
export const largestExit = (data: FormJourneysDto): JourneyNode | null =>
  data.nodes
    .filter((n) => n.kind === "exit")
    .reduce<JourneyNode | null>(
      (best, n) => (best === null || n.count > best.count ? n : best),
      null,
    );

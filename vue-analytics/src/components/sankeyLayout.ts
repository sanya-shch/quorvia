import type { FormJourneysDto, JourneyLink, JourneyNode } from "@quorvia/shared-types";

/**
 * Layout of the journey map (a Sankey diagram) without a charting library: the data is small
 * (a few dozen nodes), the picture is rendered as HTML cards over SVG ribbons, and a pure
 * function is easy to test.
 *
 * Columns are the steps of the respondent's path; inside a column nodes are stacked top to
 * bottom (questions in form order, then "later steps", then the outcomes, exits last). A node is
 * as tall as the share of attempts passing through it, but never shorter than `minNodeHeight`,
 * because it carries a label. Ribbons leave and enter a node in stacked slots, ordered by the
 * vertical position of the other end so they cross as little as possible.
 */
export interface LayoutOptions {
  columnWidth: number;
  nodeWidth: number;
  // Vertical room for the tallest column.
  height: number;
  nodePadding: number;
  minNodeHeight: number;
  // Nodes (other than the start) carrying less than this share of all attempts are left out,
  // with the ribbons that touch them. 0 keeps everything.
  hideBelow: number;
}

export interface PlacedNode extends JourneyNode {
  x: number;
  y: number;
  width: number;
  height: number;
  // "main": one route in its column; "conditional": the column splits into several routes.
  route: "main" | "conditional";
}

export interface PlacedLink extends JourneyLink {
  key: string;
  // Centre line of the ribbon, drawn as a thick stroke.
  path: string;
  thickness: number;
  targetKind: JourneyNode["kind"];
  route: "main" | "conditional";
}

export interface JourneyLayout {
  width: number;
  height: number;
  nodes: PlacedNode[];
  links: PlacedLink[];
  // Nodes dropped by `hideBelow`.
  hiddenNodes: number;
}

const KIND_RANK: Record<JourneyNode["kind"], number> = {
  start: 0,
  question: 1,
  more: 2,
  submitted: 3,
  exit: 4,
};

export const linkKey = (link: Pick<JourneyLink, "source" | "target">): string =>
  `${link.source}>${link.target}`;

export const layoutJourney = (data: FormJourneysDto, options: LayoutOptions): JourneyLayout => {
  const { columnWidth, nodeWidth, nodePadding, minNodeHeight, hideBelow } = options;
  const threshold = data.totalAttempts * hideBelow;

  const kept = data.nodes.filter((n) => n.kind === "start" || n.count >= threshold);
  const keptIds = new Set(kept.map((n) => n.id));
  const links = data.links.filter((l) => keptIds.has(l.source) && keptIds.has(l.target));

  const columns = new Map<number, JourneyNode[]>();
  for (const node of kept) {
    const column = columns.get(node.column) ?? [];
    column.push(node);
    columns.set(node.column, column);
  }
  for (const column of columns.values()) {
    column.sort(
      (a, b) =>
        KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
        (a.order ?? 0) - (b.order ?? 0) ||
        b.count - a.count ||
        a.id.localeCompare(b.id),
    );
  }

  // One scale for the whole picture: the column that needs the most room sets it.
  let scale = Infinity;
  for (const column of columns.values()) {
    const room = options.height - (column.length - 1) * nodePadding;
    const total = column.reduce((sum, n) => sum + n.count, 0);
    if (total > 0) scale = Math.min(scale, room / total);
  }
  if (!Number.isFinite(scale) || scale <= 0) scale = 0;

  const columnCount = data.columns;
  const width = Math.max(1, columnCount - 1) * columnWidth + nodeWidth;
  const placed = new Map<string, PlacedNode>();
  let contentHeight = 0;

  for (const [columnIndex, column] of columns) {
    const heights = column.map((n) => Math.max(minNodeHeight, n.count * scale));
    const stack = heights.reduce((sum, h) => sum + h, 0) + (column.length - 1) * nodePadding;
    contentHeight = Math.max(contentHeight, stack);

    const routes = column.filter((n) => n.kind === "question").length > 1 ? "conditional" : "main";
    let y = 0;

    column.forEach((node, i) => {
      placed.set(node.id, {
        ...node,
        x: columnIndex * columnWidth,
        y,
        width: nodeWidth,
        height: heights[i],
        route: node.kind === "question" ? routes : "main",
      });
      y += heights[i] + nodePadding;
    });
  }

  // Centre every column on the tallest one, so a short column is not stuck to the top.
  for (const column of columns.values()) {
    const last = placed.get(column[column.length - 1].id)!;
    const stackEnd = last.y + last.height;
    const shift = (contentHeight - stackEnd) / 2;
    for (const node of column) placed.get(node.id)!.y += shift;
  }

  // Ribbon slots: outgoing ribbons of a node are stacked in the order of their targets' y,
  // incoming ones in the order of their sources' y.
  const thicknessOf = (link: JourneyLink) => Math.max(1, link.count * scale);
  const outgoing = new Map<string, JourneyLink[]>();
  const incoming = new Map<string, JourneyLink[]>();
  for (const link of links) {
    (outgoing.get(link.source) ?? outgoing.set(link.source, []).get(link.source)!).push(link);
    (incoming.get(link.target) ?? incoming.set(link.target, []).get(link.target)!).push(link);
  }

  const sourceOffset = new Map<string, number>();
  const targetOffset = new Map<string, number>();
  const slots = (
    byNode: Map<string, JourneyLink[]>,
    other: (link: JourneyLink) => string,
    into: Map<string, number>,
  ) => {
    for (const [nodeId, list] of byNode) {
      const node = placed.get(nodeId)!;
      list.sort((a, b) => placed.get(other(a))!.y - placed.get(other(b))!.y);
      const total = list.reduce((sum, l) => sum + thicknessOf(l), 0);
      let offset = node.y + Math.max(0, (node.height - total) / 2);
      for (const link of list) {
        into.set(`${linkKey(link)}`, offset);
        offset += thicknessOf(link);
      }
    }
  };
  slots(outgoing, (l) => l.target, sourceOffset);
  slots(incoming, (l) => l.source, targetOffset);

  const placedLinks: PlacedLink[] = links.map((link) => {
    const key = linkKey(link);
    const from = placed.get(link.source)!;
    const to = placed.get(link.target)!;
    const thickness = thicknessOf(link);
    const y0 = sourceOffset.get(key)! + thickness / 2;
    const y1 = targetOffset.get(key)! + thickness / 2;
    const x0 = from.x + from.width;
    const x1 = to.x;
    const mid = (x0 + x1) / 2;

    return {
      ...link,
      key,
      thickness,
      path: `M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1}`,
      targetKind: to.kind,
      route: to.route,
    };
  });

  return {
    width,
    height: Math.max(contentHeight, minNodeHeight),
    nodes: [...placed.values()],
    links: placedLinks,
    hiddenNodes: data.nodes.length - kept.length,
  };
};

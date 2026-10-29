<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { QuestionPathEdge, QuestionPathNode } from "@quorvia/shared-types";

const props = defineProps<{
  nodes: QuestionPathNode[];
  edges: QuestionPathEdge[];
  totalResponses: number;
}>();

const { t } = useI18n();

const WIDTH = 640;
const NODE_W = 420;
const NODE_H = 48;
const ROW_H = 104;
const MARGIN_TOP = 40;
const CENTER_X = WIDTH / 2;

// Індекс -1 зарезервовано під віртуальний "старт" форми - перед першим
// реальним питанням, щоб показати перехід зі старту до першого показаного.
const indexById = computed(() => new Map(props.nodes.map((n, i) => [n.questionId, i])));

const rowY = (index: number) => MARGIN_TOP + (index + 1) * ROW_H;

const nodeBoxes = computed(() =>
  props.nodes.map((n, i) => ({
    id: n.questionId,
    x: (WIDTH - NODE_W) / 2,
    y: rowY(i),
    width: NODE_W,
    height: NODE_H,
    text: n.text || t("analytics.common.untitledQuestion"),
    shownCount: n.shownCount,
    percent: props.totalResponses > 0 ? Math.round((n.shownCount / props.totalResponses) * 100) : 0,
  })),
);

const maxEdgeCount = computed(() => Math.max(1, ...props.edges.map((e) => e.count)));

const edgePaths = computed(() => {
  const idx = indexById.value;

  return props.edges
    .map((edge, i) => {
      const fromIndex = edge.fromQuestionId === null ? -1 : idx.get(edge.fromQuestionId);
      const toIndex = idx.get(edge.toQuestionId);
      if (toIndex === undefined || fromIndex === undefined) return null;

      const sourceY = fromIndex === -1 ? MARGIN_TOP - 8 : rowY(fromIndex) + NODE_H;
      const targetY = rowY(toIndex);
      const skipDistance = toIndex - fromIndex;
      const isSkip = skipDistance > 1;

      const strokeWidth = 2 + (edge.count / maxEdgeCount.value) * 10;
      const opacity = 0.25 + 0.55 * (edge.count / maxEdgeCount.value);

      let d: string;
      if (isSkip) {
        const bulge = 26 + (skipDistance - 1) * 22;
        d = `M ${CENTER_X} ${sourceY} C ${CENTER_X + bulge} ${sourceY + 22}, ${CENTER_X + bulge} ${targetY - 22}, ${CENTER_X} ${targetY}`;
      } else {
        d = `M ${CENTER_X} ${sourceY} L ${CENTER_X} ${targetY}`;
      }

      return {
        key: `${edge.fromQuestionId ?? "start"}-${edge.toQuestionId}-${i}`,
        d,
        strokeWidth,
        opacity,
        count: edge.count,
        isSkip,
        labelX: isSkip ? CENTER_X + 26 + (skipDistance - 1) * 22 + 6 : CENTER_X + 10,
        labelY: (sourceY + targetY) / 2,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
});

const svgHeight = computed(() => MARGIN_TOP + (props.nodes.length + 1) * ROW_H - (ROW_H - NODE_H) + 24);
</script>

<template>
  <div class="paths-wrap">
    <svg :viewBox="`0 0 ${WIDTH} ${svgHeight}`" :width="WIDTH" class="paths-svg">
      <text :x="CENTER_X" :y="MARGIN_TOP - 16" text-anchor="middle" class="start-label">
        {{ t("analytics.paths.start", { count: totalResponses }) }}
      </text>

      <path
        v-for="edge in edgePaths"
        :key="edge.key"
        :d="edge.d"
        fill="none"
        stroke="#4f46e5"
        :stroke-width="edge.strokeWidth"
        :stroke-opacity="edge.opacity"
        stroke-linecap="round"
      />
      <text
        v-for="edge in edgePaths"
        :key="`${edge.key}-label`"
        :x="edge.labelX"
        :y="edge.labelY"
        class="edge-label"
        :class="{ 'edge-label--skip': edge.isSkip }"
      >
        {{ edge.count }}
      </text>

      <g v-for="box in nodeBoxes" :key="box.id">
        <rect :x="box.x" :y="box.y" :width="box.width" :height="box.height" rx="12" class="node-box" />
        <text :x="box.x + 16" :y="box.y + box.height / 2 - 4" class="node-text">
          {{ box.text.length > 46 ? box.text.slice(0, 46) + "…" : box.text }}
        </text>
        <text :x="box.x + 16" :y="box.y + box.height / 2 + 14" class="node-meta">
          {{ t("analytics.paths.ofTotal", { count: box.shownCount, total: totalResponses, percent: box.percent }) }}
        </text>
      </g>
    </svg>

    <p v-if="edgePaths.some((e) => e.isSkip)" class="hint">
      {{ t("analytics.paths.hint") }}
    </p>
  </div>
</template>

<style scoped>
.paths-wrap {
  overflow-x: auto;
}
.paths-svg {
  display: block;
  margin: 0 auto;
  max-width: 100%;
  height: auto;
}
.start-label {
  font-size: 11px;
  font-weight: 700;
  fill: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.node-box {
  fill: white;
  stroke: #e2e8f0;
  stroke-width: 1.5;
}
.node-text {
  font-size: 13px;
  font-weight: 700;
  fill: #1e293b;
}
.node-meta {
  font-size: 11px;
  fill: #94a3b8;
}
.edge-label {
  font-size: 10px;
  font-weight: 700;
  fill: #4f46e5;
}
.edge-label--skip {
  fill: #7c6ff0;
}
.hint {
  margin-top: 8px;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}
</style>

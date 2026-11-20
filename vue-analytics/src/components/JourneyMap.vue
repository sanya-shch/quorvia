<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { FormJourneysDto } from "@quorvia/shared-types";
import { layoutJourney, type PlacedLink, type PlacedNode } from "./sankeyLayout";
import { describeNode } from "./journeyStats";
import { formatPercent } from "../kpi";

const props = defineProps<{
  data: FormJourneysDto;
  mode: "counts" | "percent";
  hideLowVolume: boolean;
  zoom: number;
  selectedId: string | null;
}>();
const emit = defineEmits<{ (e: "select", id: string | null): void }>();

const { t } = useI18n();

const HEADER = 34;
const LOW_VOLUME_SHARE = 0.03;

const layout = computed(() =>
  layoutJourney(props.data, {
    columnWidth: 250,
    nodeWidth: 176,
    height: 330,
    nodePadding: 14,
    minNodeHeight: 62,
    hideBelow: props.hideLowVolume ? LOW_VOLUME_SHARE : 0,
  }),
);

const total = computed(() => props.data.totalAttempts);
const show = (count: number) =>
  props.mode === "counts"
    ? String(count)
    : formatPercent(total.value > 0 ? count / total.value : 0);

// A node hovered or focused lights up its ribbons; a selected one keeps them lit.
const hoveredId = ref<string | null>(null);
const focusId = computed(() => hoveredId.value ?? props.selectedId);

const nodeById = computed(() => new Map(layout.value.nodes.map((n) => [n.id, n])));
const isLit = (link: PlacedLink) =>
  focusId.value === null || link.source === focusId.value || link.target === focusId.value;
const isRelated = (node: PlacedNode) =>
  focusId.value === null ||
  node.id === focusId.value ||
  layout.value.links.some(
    (l) =>
      (l.source === focusId.value && l.target === node.id) ||
      (l.target === focusId.value && l.source === node.id),
  );

const linkColor = (link: PlacedLink) =>
  link.targetKind === "exit"
    ? "#dc2626"
    : link.targetKind === "submitted" || link.route === "conditional"
      ? "#059669"
      : "#4f46e5";

const linkTitle = (link: PlacedLink) => {
  const from = nodeById.value.get(link.source)!;
  const to = nodeById.value.get(link.target)!;
  const label = (n: PlacedNode) => {
    const d = describeNode(n, t);
    return n.kind === "question" ? `${d.eyebrow} ${d.title}` : `${d.eyebrow} ${d.title}`;
  };
  return `${label(from)} → ${label(to)}: ${link.count} (${formatPercent(total.value > 0 ? link.count / total.value : 0)})`;
};

const columnLabel = (column: number) =>
  column === 0
    ? t("analytics.journey.start")
    : column === props.data.columns - 1
      ? t("analytics.journey.outcome")
      : t("analytics.journey.step", { step: column });

const nodeLabel = (node: PlacedNode) => {
  const d = describeNode(node, t);
  return `${d.eyebrow}: ${d.title}, ${node.count} (${formatPercent(total.value > 0 ? node.count / total.value : 0)})`;
};

const innerWidth = computed(() => layout.value.width);
const innerHeight = computed(() => layout.value.height + HEADER + 12);
</script>

<template>
  <div v-if="data.totalAttempts === 0" class="empty">{{ t("analytics.journey.empty") }}</div>

  <div v-else class="viewport" tabindex="-1">
    <div
      class="sizer"
      :style="{ width: `${innerWidth * zoom}px`, height: `${innerHeight * zoom}px` }"
    >
      <div
        class="stage"
        :style="{
          width: `${innerWidth}px`,
          height: `${innerHeight}px`,
          transform: `scale(${zoom})`,
        }"
      >
        <span
          v-for="c in data.columns"
          :key="`col-${c}`"
          class="col-label"
          :style="{ left: `${(c - 1) * 250}px` }"
        >
          {{ columnLabel(c - 1) }}
        </span>

        <svg class="ribbons" :width="innerWidth" :height="innerHeight" aria-hidden="true">
          <g :transform="`translate(0, ${HEADER})`">
            <path
              v-for="link in layout.links"
              :key="link.key"
              :d="link.path"
              :stroke="linkColor(link)"
              :stroke-width="link.thickness"
              :opacity="isLit(link) ? (focusId === null ? 0.24 : 0.55) : 0.06"
              class="ribbon"
              fill="none"
            >
              <title>{{ linkTitle(link) }}</title>
            </path>
          </g>
        </svg>

        <button
          v-for="node in layout.nodes"
          :key="node.id"
          type="button"
          class="node"
          :class="[
            `node--${node.kind}`,
            `node--${node.route}`,
            { 'node--selected': selectedId === node.id, 'node--dim': !isRelated(node) },
          ]"
          :style="{
            left: `${node.x}px`,
            top: `${node.y + HEADER}px`,
            width: `${node.width}px`,
            height: `${node.height}px`,
          }"
          :aria-pressed="selectedId === node.id"
          :aria-label="nodeLabel(node)"
          @click="emit('select', selectedId === node.id ? null : node.id)"
          @mouseenter="hoveredId = node.id"
          @mouseleave="hoveredId = null"
          @focus="hoveredId = node.id"
          @blur="hoveredId = null"
          @keydown.esc="emit('select', null)"
        >
          <span class="eyebrow">{{ describeNode(node, t).eyebrow }}</span>
          <span class="title">{{ describeNode(node, t).title }}</span>
          <span class="count">
            <strong>{{ show(node.count) }}</strong>
            <small>{{
              mode === "counts" ? formatPercent(total > 0 ? node.count / total : 0) : node.count
            }}</small>
          </span>
        </button>
      </div>
    </div>
  </div>

  <p v-if="layout.hiddenNodes > 0" class="hidden-note">
    {{ t("analytics.journey.hiddenNodes", { count: layout.hiddenNodes }) }}
  </p>
</template>

<style scoped>
.viewport {
  overflow: auto;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  max-height: 640px;
}
.sizer {
  position: relative;
}
.stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.col-label {
  position: absolute;
  top: 0;
  width: 176px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}
.ribbons {
  position: absolute;
  top: 0;
  left: 0;
}
.ribbon {
  transition: opacity 0.15s;
}
.node {
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  box-sizing: border-box;
  padding: 6px 10px;
  text-align: left;
  background: white;
  border: 2px solid #4f46e5;
  border-radius: 10px;
  cursor: pointer;
  transition:
    opacity 0.15s,
    box-shadow 0.15s;
  overflow: hidden;
}
.node:hover,
.node:focus-visible {
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.25);
  outline: none;
}
.node:focus-visible {
  outline: 2px solid #1e1b4b;
  outline-offset: 2px;
}
.node--conditional,
.node--submitted {
  border-color: #059669;
}
.node--exit {
  border-color: #dc2626;
}
.node--start {
  border-color: #4f46e5;
  background: #eef2ff;
}
.node--more {
  border-color: #94a3b8;
  border-style: dashed;
}
.node--selected {
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.3);
}
.node--dim {
  opacity: 0.35;
}
.eyebrow {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #4f46e5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.node--conditional .eyebrow,
.node--submitted .eyebrow {
  color: #059669;
}
.node--exit .eyebrow {
  color: #dc2626;
}
.node--more .eyebrow {
  color: #64748b;
}
.title {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.count {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}
.count strong {
  font-size: 13px;
  color: #0f172a;
}
.count small {
  font-size: 11px;
  color: #94a3b8;
}
.empty {
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
  padding: 40px 0;
  border: 1px dashed #e2e8f0;
  border-radius: 14px;
}
.hidden-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: #94a3b8;
}
</style>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { FormJourneysDto, JourneyNode } from "@quorvia/shared-types";
import { describeNode } from "./journeyStats";
import { formatPercent } from "../kpi";

const props = defineProps<{
  data: FormJourneysDto;
  mode: "counts" | "percent";
  hideLowVolume: boolean;
  selectedId: string | null;
}>();
const emit = defineEmits<{ (e: "select", id: string | null): void }>();

const { t } = useI18n();
const LOW_VOLUME_SHARE = 0.03;

const KIND_RANK: Record<JourneyNode["kind"], number> = {
  start: 0,
  question: 1,
  more: 2,
  submitted: 3,
  exit: 4,
};

// The same data as the map, as plain steps one under another: it reads well on a phone and for
// screen readers, where a wide diagram does not.
const groups = computed(() => {
  const threshold = props.hideLowVolume ? props.data.totalAttempts * LOW_VOLUME_SHARE : 0;
  const columns = new Map<number, JourneyNode[]>();

  for (const node of props.data.nodes) {
    if (node.kind !== "start" && node.count < threshold) continue;
    (columns.get(node.column) ?? columns.set(node.column, []).get(node.column)!).push(node);
  }

  return [...columns.entries()]
    .sort(([a], [b]) => a - b)
    .map(([column, nodes]) => ({
      column,
      label:
        column === 0
          ? t("analytics.journey.start")
          : column === props.data.columns - 1
            ? t("analytics.journey.outcome")
            : t("analytics.journey.step", { step: column }),
      nodes: nodes.sort(
        (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || (a.order ?? 0) - (b.order ?? 0),
      ),
    }));
});

const share = (count: number) =>
  props.data.totalAttempts > 0 ? count / props.data.totalAttempts : 0;
const value = (count: number) =>
  props.mode === "counts" ? String(count) : formatPercent(share(count));
</script>

<template>
  <div v-if="data.totalAttempts === 0" class="empty">{{ t("analytics.journey.empty") }}</div>

  <ol v-else class="steps">
    <li v-for="group in groups" :key="group.column" class="group">
      <h4 class="group-title">{{ group.label }}</h4>
      <ul class="nodes">
        <li v-for="node in group.nodes" :key="node.id">
          <button
            type="button"
            class="row"
            :class="[`row--${node.kind}`, { 'row--selected': selectedId === node.id }]"
            :aria-pressed="selectedId === node.id"
            @click="emit('select', selectedId === node.id ? null : node.id)"
          >
            <span class="row-head">
              <span class="row-eyebrow">{{ describeNode(node, t).eyebrow }}</span>
              <span class="row-value">{{ value(node.count) }}</span>
            </span>
            <span class="row-title">{{ describeNode(node, t).title }}</span>
            <span class="track"
              ><span class="fill" :style="{ width: `${share(node.count) * 100}%` }"
            /></span>
          </button>
        </li>
      </ul>
    </li>
  </ol>
</template>

<style scoped>
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.group-title {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}
.nodes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}
.row {
  width: 100%;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: white;
  border: 2px solid #4f46e5;
  border-radius: 10px;
  padding: 8px 12px;
  cursor: pointer;
}
.row--submitted {
  border-color: #059669;
}
.row--exit {
  border-color: #dc2626;
}
.row--more {
  border-color: #94a3b8;
  border-style: dashed;
}
.row--selected {
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.3);
}
.row:focus-visible {
  outline: 2px solid #1e1b4b;
  outline-offset: 2px;
}
.row-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.row-eyebrow {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #4f46e5;
}
.row--submitted .row-eyebrow {
  color: #059669;
}
.row--exit .row-eyebrow {
  color: #dc2626;
}
.row-value {
  font-size: 13px;
  font-weight: 800;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}
.row-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}
.track {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  background: #4f46e5;
}
.row--submitted .fill {
  background: #059669;
}
.row--exit .fill {
  background: #dc2626;
}
.empty {
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
  padding: 40px 0;
  border: 1px dashed #e2e8f0;
  border-radius: 14px;
}
</style>

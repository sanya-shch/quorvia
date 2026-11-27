<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { FormFunnelDto } from "@quorvia/shared-types";
import { formatDuration, formatPercent } from "../kpi";

const props = defineProps<{
  funnel: FormFunnelDto;
  // Questions that have a detail panel; the others are shown as plain text.
  inspectableIds?: string[];
}>();
const emit = defineEmits<{ (e: "open-question", questionId: string): void }>();

const { t } = useI18n();

const COLLAPSED_ROWS = 8;
const sortMode = ref<"form" | "dropoff">("form");
const showAll = ref(false);

const rows = computed(() => {
  const total = props.funnel.totalAttempts;
  const nodes = props.funnel.nodes;
  const highest = nodes.reduce<number>((best, n) => Math.max(best, n.exitedCount), 0);
  let marked = false;

  const list = nodes.map((node, i) => {
    const prev = nodes[i - 1];
    const lost = prev ? prev.reachedCount - node.reachedCount : 0;
    // Only the first of equal maxima carries the badge.
    const isHighest = highest > 0 && node.exitedCount === highest && !marked;
    if (isHighest) marked = true;

    return {
      ...node,
      number: i + 1,
      percentOfTotal: total > 0 ? node.reachedCount / total : 0,
      exitShare: node.reachedCount > 0 ? node.exitedCount / node.reachedCount : 0,
      lostVsPrev: lost,
      isHighest,
      inspectable: props.inspectableIds?.includes(node.questionId) ?? false,
    };
  });

  return sortMode.value === "dropoff"
    ? [...list].sort((a, b) => b.exitedCount - a.exitedCount || a.number - b.number)
    : list;
});

const visibleRows = computed(() =>
  showAll.value ? rows.value : rows.value.slice(0, COLLAPSED_ROWS),
);
const highest = computed(() => rows.value.find((r) => r.isHighest) ?? null);
const unfinished = computed(() => props.funnel.totalAttempts - props.funnel.totalCompletions);
</script>

<template>
  <div class="funnel">
    <div class="tiles">
      <div class="tile">
        <span class="tile-label">{{ t("analytics.funnel.started") }}</span>
        <span class="tile-value">{{ funnel.totalAttempts }} <small>100%</small></span>
      </div>
      <div class="tile">
        <span class="tile-label">{{ t("analytics.funnel.submitted") }}</span>
        <span class="tile-value">
          {{ funnel.totalCompletions }}
          <small class="ok">{{ formatPercent(funnel.completionRate) }}</small>
        </span>
      </div>
      <div class="tile tile--accent">
        <span class="tile-label">{{ t("analytics.funnel.highestFriction") }}</span>
        <span v-if="highest" class="tile-value">
          Q{{ highest.number }}
          <small class="bad">{{
            t("analytics.funnel.exits", { count: highest.exitedCount })
          }}</small>
        </span>
        <span v-else class="tile-value">-</span>
      </div>
      <div class="tile">
        <span class="tile-label">{{ t("analytics.funnel.medianTime") }}</span>
        <span class="tile-value">{{ formatDuration(funnel.medianCompletionSeconds) }}</span>
      </div>
    </div>

    <p class="hint">{{ t("analytics.funnel.hint") }}</p>

    <div v-if="funnel.totalAttempts === 0" class="empty">{{ t("analytics.funnel.empty") }}</div>

    <template v-else>
      <div class="toolbar">
        <span v-if="unfinished > 0" class="badge">{{
          t("analytics.funnel.unfinished", { count: unfinished })
        }}</span>
        <button
          type="button"
          class="sort"
          @click="sortMode = sortMode === 'form' ? 'dropoff' : 'form'"
        >
          {{
            sortMode === "form" ? t("analytics.funnel.sortForm") : t("analytics.funnel.sortDropoff")
          }}
        </button>
      </div>

      <div class="table" role="table" :aria-label="t('analytics.funnel.sectionTitle')">
        <div class="thead" role="row">
          <span role="columnheader">{{ t("analytics.funnel.colQuestion") }}</span>
          <span role="columnheader" class="num">{{ t("analytics.funnel.colReached") }}</span>
          <span role="columnheader">{{ t("analytics.funnel.colCompletion") }}</span>
          <span role="columnheader" class="num">{{ t("analytics.funnel.colExits") }}</span>
        </div>

        <div
          v-for="row in visibleRows"
          :key="row.questionId"
          class="tr"
          :class="{ 'tr--highest': row.isHighest }"
          role="row"
        >
          <div class="cell-question" role="cell">
            <span class="qnum">{{ String(row.number).padStart(2, "0") }}</span>
            <button
              v-if="row.inspectable"
              type="button"
              class="qtext qtext--link"
              @click="emit('open-question', row.questionId)"
            >
              {{ row.text || t("analytics.common.untitledQuestion") }}
            </button>
            <span v-else class="qtext">{{
              row.text || t("analytics.common.untitledQuestion")
            }}</span>
            <span v-if="row.isHighest" class="flag">{{
              t("analytics.funnel.highestDropoff")
            }}</span>
          </div>

          <div class="cell-reached num" role="cell">
            <span class="strong">{{ row.reachedCount }}</span>
            <span v-if="row.lostVsPrev > 0" class="lost">{{
              t("analytics.funnel.dropOff", { count: row.lostVsPrev })
            }}</span>
          </div>

          <div class="cell-bar" role="cell">
            <span class="bar-label">{{
              t("analytics.funnel.continued", { value: formatPercent(row.percentOfTotal) })
            }}</span>
            <div class="track">
              <div class="fill va-grow-x" :style="{ width: `${row.percentOfTotal * 100}%` }" />
            </div>
          </div>

          <div class="cell-exits num" role="cell">
            <span :class="row.exitedCount > 0 ? 'bad strong' : 'muted'">{{ row.exitedCount }}</span>
            <span class="muted">{{ formatPercent(row.exitShare) }}</span>
          </div>
        </div>
      </div>

      <button
        v-if="rows.length > COLLAPSED_ROWS"
        type="button"
        class="more"
        @click="showAll = !showAll"
      >
        {{
          showAll
            ? t("analytics.funnel.showFewer")
            : t("analytics.funnel.viewAll", { count: rows.length })
        }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
@media (min-width: 800px) {
  .tiles {
    grid-template-columns: repeat(4, 1fr);
  }
}
.tile {
  background: var(--color-slate-50, #f8fafc);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.tile--accent {
  background: var(--color-indigo-50, #eef2ff);
}
.tile-label {
  font-size: 12px;
  color: var(--color-slate-500, #64748b);
}
.tile-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-slate-900, #0f172a);
  font-variant-numeric: tabular-nums;
}
.tile-value small {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-slate-500, #64748b);
}
.ok {
  color: var(--color-emerald-700, #047857) !important;
}
.bad {
  color: var(--color-red-700, #b91c1c) !important;
}
.hint {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--color-slate-500, #64748b);
}
.empty {
  margin-top: 20px;
  text-align: center;
  color: var(--color-slate-500, #64748b);
  font-size: 14px;
  padding: 24px 0;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin: 14px 0 6px;
}
.badge {
  background: var(--color-indigo-50, #eef2ff);
  color: var(--color-indigo-700, #4338ca);
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 999px;
}
.sort {
  margin-left: auto;
  border: 1px solid var(--color-slate-200, #e2e8f0);
  background: var(--color-white, #fff);
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-slate-700, #334155);
  cursor: pointer;
}
.sort:hover {
  border-color: var(--color-indigo-200, #c7d2fe);
}
.table {
  border-top: 1px solid var(--color-slate-200, #e2e8f0);
}
.thead,
.tr {
  display: grid;
  grid-template-columns: minmax(0, 2.4fr) 0.8fr minmax(0, 2fr) 0.9fr;
  gap: 12px;
  align-items: center;
  padding: 12px 8px;
}
.thead {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-slate-500, #64748b);
  padding-top: 10px;
  padding-bottom: 6px;
}
.tr {
  border-top: 1px solid var(--color-slate-100, #f1f5f9);
}
.tr--highest {
  background: var(--color-indigo-50, #eef2ff);
  border-radius: 10px;
}
.num {
  text-align: right;
}
.cell-question {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  min-width: 0;
}
.qnum {
  font-size: 12px;
  font-weight: 800;
  color: var(--color-indigo-600, #4f46e5);
}
.qtext {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-slate-800, #1e293b);
  background: none;
  border: none;
  padding: 0;
  text-align: left;
}
.qtext--link {
  cursor: pointer;
}
.qtext--link:hover {
  color: var(--color-indigo-600, #4f46e5);
  text-decoration: underline;
}
.flag {
  background: var(--color-red-50, #fef2f2);
  color: var(--color-red-700, #b91c1c);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.cell-reached,
.cell-exits {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.strong {
  font-weight: 800;
  color: var(--color-slate-900, #0f172a);
}
.muted {
  color: var(--color-slate-500, #64748b);
  font-size: 12px;
}
.lost {
  font-size: 11px;
  color: var(--color-slate-500, #64748b);
}
.cell-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bar-label {
  font-size: 11px;
  color: var(--color-slate-500, #64748b);
}
.track {
  height: 8px;
  background: var(--color-slate-200, #e2e8f0);
  border-radius: 999px;
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--color-indigo-600, #4f46e5);
  border-radius: 999px;
}
.more {
  display: block;
  margin: 12px auto 0;
  border: none;
  background: none;
  color: var(--color-indigo-600, #4f46e5);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.more:hover {
  text-decoration: underline;
}
@media (max-width: 640px) {
  .thead {
    display: none;
  }
  .tr {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "q reached"
      "bar bar"
      "exits exits";
    row-gap: 8px;
  }
  .cell-question {
    grid-area: q;
  }
  .cell-reached {
    grid-area: reached;
  }
  .cell-bar {
    grid-area: bar;
  }
  .cell-exits {
    grid-area: exits;
    flex-direction: row;
    justify-content: flex-start;
    gap: 6px;
  }
  .cell-exits::before {
    content: "↳";
    color: var(--color-slate-500, #64748b);
  }
}
</style>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { FormFunnelDto } from "@quorvia/shared-types";

const props = defineProps<{
  funnel: FormFunnelDto;
}>();

const { t } = useI18n();

const maxReached = computed(() => Math.max(1, ...props.funnel.nodes.map((n) => n.reachedCount)));

const rows = computed(() =>
  props.funnel.nodes.map((node, i) => {
    const prev = props.funnel.nodes[i - 1];
    const dropOffFromPrev = prev ? prev.reachedCount - node.reachedCount : 0;
    return {
      ...node,
      percentOfMax: (node.reachedCount / maxReached.value) * 100,
      percentOfTotal:
        props.funnel.totalAttempts > 0
          ? Math.round((node.reachedCount / props.funnel.totalAttempts) * 100)
          : 0,
      dropOffFromPrev,
    };
  }),
);

const completionPercent = computed(() => Math.round(props.funnel.completionRate * 100));
</script>

<template>
  <div class="funnel">
    <div class="headline">
      <div class="headline-stat">
        <span class="headline-value">{{ funnel.totalAttempts }}</span>
        <span class="headline-label">{{ t("analytics.funnel.attempts") }}</span>
      </div>
      <div class="headline-stat">
        <span class="headline-value headline-value--accent">{{ completionPercent }}%</span>
        <span class="headline-label">{{
          t("analytics.funnel.completed", {
            completions: funnel.totalCompletions,
            total: funnel.totalAttempts,
          })
        }}</span>
      </div>
    </div>

    <p class="hint">{{ t("analytics.funnel.hint") }}</p>

    <div v-if="funnel.totalAttempts === 0" class="empty">{{ t("analytics.funnel.empty") }}</div>

    <div v-else class="rows">
      <div v-for="row in rows" :key="row.questionId" class="row">
        <div class="row-header">
          <span class="row-text">{{ row.text || t("analytics.common.untitledQuestion") }}</span>
          <span class="row-count">{{ row.reachedCount }} ({{ row.percentOfTotal }}%)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: row.percentOfMax + '%' }" />
        </div>
        <p v-if="row.dropOffFromPrev > 0" class="drop-off">
          {{ t("analytics.funnel.dropOff", { count: row.dropOffFromPrev }) }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.funnel {
  max-width: 640px;
  margin: 0 auto;
}
.headline {
  display: flex;
  gap: 32px;
  margin-bottom: 8px;
}
.headline-stat {
  display: flex;
  flex-direction: column;
}
.headline-value {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
}
.headline-value--accent {
  color: #4f46e5;
}
.headline-label {
  font-size: 12px;
  color: #94a3b8;
}
.hint {
  font-size: 12px;
  color: #94a3b8;
  margin: 0 0 20px;
}
.empty {
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  padding: 24px 0;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.row-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  margin-bottom: 4px;
}
.row-text {
  font-weight: 600;
  color: #334155;
}
.row-count {
  color: #94a3b8;
  font-size: 12px;
  flex-shrink: 0;
  margin-left: 12px;
}
.bar-track {
  height: 10px;
  background: #f1f5f9;
  border-radius: 999px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4f46e5, #7c6ff0);
  border-radius: 999px;
  transition: width 0.3s ease;
}
.drop-off {
  margin: 4px 0 0;
  font-size: 11px;
  color: #dc2626;
}
</style>

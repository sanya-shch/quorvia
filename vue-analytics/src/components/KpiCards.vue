<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { AnalyticsSummaryDto } from "@quorvia/shared-types";
import { formatPercent, formatSigned, kpiDeltas, trendOf, type Trend } from "../kpi";

const props = defineProps<{
  summary: AnalyticsSummaryDto | null;
  isLoading: boolean;
  error: string | null;
}>();

const { t } = useI18n();

const current = computed(() => props.summary?.current ?? null);
const deltas = computed(() =>
  props.summary ? kpiDeltas(props.summary.current, props.summary.previous) : null,
);

// A change is good when the number goes up; "abandoned" has no change line (its share is shown).
type DeltaLine = { text: string; trend: Trend };
const deltaLine = (value: number | null | undefined, unit: "percent" | "points"): DeltaLine => {
  if (!deltas.value) return { text: t("analytics.kpi.allTime"), trend: "flat" };
  if (value === null || value === undefined)
    return { text: t("analytics.kpi.noPrior"), trend: "flat" };

  const sign = formatSigned(value);
  return {
    text: t(unit === "percent" ? "analytics.kpi.vsPrior" : "analytics.kpi.vsPriorPoints", {
      value: sign,
    }),
    trend: trendOf(value),
  };
};

const cards = computed(() => {
  const c = current.value;
  if (!c) return [];

  return [
    {
      key: "responses",
      value: String(c.responses),
      delta: deltaLine(deltas.value?.responses, "percent"),
      note: null as string | null,
    },
    {
      key: "started",
      value: String(c.started),
      delta: deltaLine(deltas.value?.started, "percent"),
      note: t("analytics.kpi.includesUnfinished", { count: c.abandoned }),
    },
    {
      key: "completion",
      value: formatPercent(c.completionRate),
      delta: deltaLine(deltas.value?.completionPoints, "points"),
      note: null,
    },
    {
      key: "abandoned",
      value: String(c.abandoned),
      delta: {
        text: t("analytics.kpi.ofStarted", {
          value: c.started > 0 ? formatPercent(c.abandoned / c.started) : "0.0%",
        }),
        trend: (c.abandoned > 0 ? "down" : "flat") as Trend,
      },
      note: null,
    },
  ];
});
</script>

<template>
  <div v-if="error" class="state state--error" role="alert">{{ t(error) }}</div>

  <div v-else class="grid" :aria-busy="isLoading">
    <template v-if="isLoading && !summary">
      <div v-for="n in 4" :key="n" class="card card--skeleton" aria-hidden="true" />
    </template>

    <article v-for="card in cards" :key="card.key" class="card">
      <header class="card-head">
        <h3 class="label">{{ t(`analytics.kpi.${card.key}`) }}</h3>
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <template v-if="card.key === 'responses'">
            <path d="M4 13l2.5-7h11L20 13v5H4z" />
            <path d="M4 13h4l1.5 2h5L16 13h4" />
          </template>
          <template v-else-if="card.key === 'started'">
            <path d="M8 5l11 7-11 7z" />
          </template>
          <template v-else-if="card.key === 'completion'">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12.5l3 3 5-6" />
          </template>
          <template v-else>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5M12 16.5h.01" />
          </template>
        </svg>
      </header>
      <p class="value">{{ card.value }}</p>
      <p class="delta" :class="`delta--${card.key === 'abandoned' ? 'bad' : card.delta.trend}`">
        {{ card.delta.text }}
      </p>
      <p v-if="card.note" class="note">{{ card.note }}</p>
    </article>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
@media (min-width: 900px) {
  .grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
}
.card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px 18px;
  min-width: 0;
}
.card--skeleton {
  height: 104px;
  background: linear-gradient(90deg, #f1f5f9, #f8fafc, #f1f5f9);
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.label {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: #4f46e5;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
.value {
  margin: 8px 0 2px;
  font-size: 30px;
  line-height: 1.1;
  font-weight: 800;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}
.delta {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}
.delta--up {
  color: #059669;
}
.delta--down,
.delta--bad {
  color: #dc2626;
}
.note {
  margin: 2px 0 0;
  font-size: 11px;
  color: #94a3b8;
}
.state {
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
  padding: 24px;
}
.state--error {
  color: #dc2626;
}
</style>

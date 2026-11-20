<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { AnalyticsDailyPoint } from "@quorvia/shared-types";

const props = defineProps<{ daily: AnalyticsDailyPoint[] }>();
const { t } = useI18n();

const W = 640;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 34 };

// A "nice" top of the y axis, so the gridlines read 0 / 5 / 10 instead of 0 / 4.3 / 8.6.
const niceMax = (value: number): number => {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= value)!;
  return step * 4;
};

const max = computed(() =>
  niceMax(Math.max(0, ...props.daily.map((d) => Math.max(d.started, d.submitted)))),
);
const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;

const x = (i: number) =>
  PAD.left + (props.daily.length <= 1 ? innerW / 2 : (i / (props.daily.length - 1)) * innerW);
const y = (v: number) => PAD.top + innerH - (v / max.value) * innerH;

const line = (key: "started" | "submitted") =>
  props.daily
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`)
    .join(" ");

const area = computed(() => {
  if (props.daily.length === 0) return "";
  const last = props.daily.length - 1;
  return `${line("submitted")} L${x(last).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
});

const grid = computed(() =>
  [0, 1, 2, 3, 4].map((i) => ({ value: (max.value / 4) * i, y: y((max.value / 4) * i) })),
);

const labelIndexes = computed(() => {
  const n = props.daily.length;
  if (n <= 1) return [0];
  return [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
});

const shortDate = (iso: string) => iso.slice(5).replace("-", "/");
const totals = computed(() => ({
  started: props.daily.reduce((s, d) => s + d.started, 0),
  submitted: props.daily.reduce((s, d) => s + d.submitted, 0),
}));
</script>

<template>
  <figure class="trend">
    <figcaption class="head">
      <div>
        <h3 class="title">{{ t("analytics.trend.title") }}</h3>
        <p class="hint">{{ t("analytics.trend.hint") }}</p>
      </div>
      <ul class="legend">
        <li><span class="dot dot--started" />{{ t("analytics.trend.started") }}</li>
        <li><span class="dot dot--submitted" />{{ t("analytics.trend.submitted") }}</li>
      </ul>
    </figcaption>

    <svg
      class="svg"
      :viewBox="`0 0 ${W} ${H}`"
      role="img"
      :aria-label="
        t('analytics.trend.aria', {
          started: totals.started,
          submitted: totals.submitted,
          days: daily.length,
        })
      "
    >
      <g v-for="g in grid" :key="g.value">
        <line :x1="PAD.left" :x2="W - PAD.right" :y1="g.y" :y2="g.y" class="grid" />
        <text :x="PAD.left - 6" :y="g.y + 3" class="axis axis--y">
          {{ Math.round(g.value * 10) / 10 }}
        </text>
      </g>

      <path :d="area" class="area" />
      <path :d="line('started')" class="line line--started" />
      <path :d="line('submitted')" class="line line--submitted" />

      <text
        v-for="i in labelIndexes"
        :key="i"
        :x="x(i)"
        :y="H - 6"
        class="axis axis--x"
        :text-anchor="i === 0 ? 'start' : i === daily.length - 1 ? 'end' : 'middle'"
      >
        {{ shortDate(daily[i].date) }}
      </text>

      <!-- One invisible column per day: the native tooltip gives the exact numbers. -->
      <rect
        v-for="(d, i) in daily"
        :key="d.date"
        :x="x(i) - innerW / Math.max(1, daily.length - 1) / 2"
        :y="PAD.top"
        :width="innerW / Math.max(1, daily.length - 1)"
        :height="innerH"
        class="hit"
      >
        <title>
          {{ d.date }}:
          {{ t("analytics.trend.tooltip", { started: d.started, submitted: d.submitted }) }}
        </title>
      </rect>
    </svg>
  </figure>
</template>

<style scoped>
.trend {
  margin: 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 20px 24px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
}
.hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
}
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 14px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}
.legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot--started {
  background: #4f46e5;
}
.dot--submitted {
  background: #059669;
}
.svg {
  width: 100%;
  height: auto;
  margin-top: 12px;
  display: block;
}
.grid {
  stroke: #e2e8f0;
  stroke-width: 1;
}
.axis {
  font-size: 10px;
  fill: #94a3b8;
}
.axis--y {
  text-anchor: end;
}
.line {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.line--started {
  stroke: #4f46e5;
}
.line--submitted {
  stroke: #059669;
}
.area {
  fill: #059669;
  opacity: 0.1;
}
.hit {
  fill: transparent;
}
.hit:hover {
  fill: rgba(79, 70, 229, 0.06);
}
</style>

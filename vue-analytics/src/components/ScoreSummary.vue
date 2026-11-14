<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { ScoreAnalyticsDto } from "@quorvia/shared-types";

const props = defineProps<{
  scoring: ScoreAnalyticsDto;
}>();

const { t, locale } = useI18n();

// Up to 2 decimals, in the language of the page.
const formatNumber = (value: number) =>
  value.toLocaleString(locale.value, { maximumFractionDigits: 2, useGrouping: false });

// The bar of the tallest bucket is full height; an empty histogram has no bar at all.
const maxBucket = computed(() => Math.max(0, ...props.scoring.histogram.map((b) => b.count)));

const buckets = computed(() =>
  props.scoring.histogram.map((bucket) => ({
    ...bucket,
    height: maxBucket.value > 0 ? (bucket.count / maxBucket.value) * 100 : 0,
    label: t("analytics.scoring.bucket", {
      from: bucket.fromPercent,
      to: bucket.toPercent,
      count: bucket.count,
    }),
  })),
);

const share = (count: number) =>
  props.scoring.scoredCount > 0 ? Math.round((count / props.scoring.scoredCount) * 100) : 0;

const categoryRows = computed(() => [
  ...props.scoring.categories.map((category) => ({
    key: category.id,
    label: category.label,
    range: `${formatNumber(category.min)}–${formatNumber(category.max)}`,
    count: category.count,
    percent: share(category.count),
  })),
  ...(props.scoring.uncategorizedCount > 0
    ? [
        {
          key: "__none__",
          label: t("analytics.scoring.noCategory"),
          range: "",
          count: props.scoring.uncategorizedCount,
          percent: share(props.scoring.uncategorizedCount),
        },
      ]
    : []),
]);
</script>

<template>
  <div class="score-summary">
    <p v-if="!scoring.enabled" class="note" data-test="disabled-note">
      {{ t("analytics.scoring.disabledNote") }}
    </p>

    <p v-if="scoring.scoredCount === 0" class="state" data-test="empty">
      {{ t("analytics.scoring.empty") }}
    </p>

    <template v-else>
      <div class="stats">
        <div class="stat">
          <span class="stat-value" data-test="scored-count">{{ scoring.scoredCount }}</span>
          <span class="stat-label">{{ t("analytics.scoring.scored") }}</span>
        </div>
        <div class="stat">
          <span class="stat-value stat-value--accent" data-test="average">{{
            formatNumber(scoring.average)
          }}</span>
          <span class="stat-label">{{ t("analytics.scoring.average") }}</span>
        </div>
        <div v-if="scoring.averagePercent !== null" class="stat">
          <span class="stat-value" data-test="average-percent"
            >{{ formatNumber(scoring.averagePercent) }}%</span
          >
          <span class="stat-label">{{ t("analytics.scoring.averagePercent") }}</span>
        </div>
        <div class="stat">
          <span class="stat-value" data-test="range"
            >{{ formatNumber(scoring.min) }}–{{ formatNumber(scoring.max) }}</span
          >
          <span class="stat-label">{{ t("analytics.scoring.range") }}</span>
        </div>
      </div>

      <h3 class="sub-title">{{ t("analytics.scoring.histogramTitle") }}</h3>
      <div class="histogram" role="img" :aria-label="t('analytics.scoring.histogramTitle')">
        <div
          v-for="bucket in buckets"
          :key="bucket.fromPercent"
          class="bucket"
          :title="bucket.label"
          data-test="bucket"
        >
          <span class="bucket-count">{{ bucket.count }}</span>
          <div class="bucket-bar" :style="{ height: `${bucket.height}%` }" />
          <span class="bucket-label">{{ bucket.fromPercent }}</span>
        </div>
      </div>

      <template v-if="categoryRows.length > 0">
        <h3 class="sub-title">{{ t("analytics.scoring.categoriesTitle") }}</h3>
        <ul class="categories">
          <li v-for="row in categoryRows" :key="row.key" class="category" data-test="category">
            <div class="category-head">
              <span class="category-name">{{ row.label }}</span>
              <span v-if="row.range" class="category-range">{{ row.range }}</span>
              <span class="category-count">{{
                t("analytics.scoring.categoryCount", { count: row.count, percent: row.percent })
              }}</span>
            </div>
            <div class="category-track">
              <div class="category-fill" :style="{ width: `${row.percent}%` }" />
            </div>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>

<style scoped>
.score-summary {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 20px;
}
.note {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #fffbeb;
  color: #92400e;
  font-size: 13px;
}
.state {
  margin: 0;
  color: #64748b;
  font-size: 14px;
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
.stat {
  display: flex;
  flex-direction: column;
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
}
.stat-value--accent {
  color: #4f46e5;
}
.stat-label {
  font-size: 12px;
  color: #64748b;
}
.sub-title {
  margin: 20px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}
.histogram {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 140px;
}
.bucket {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
}
.bucket-bar {
  width: 100%;
  background: #6366f1;
  border-radius: 4px 4px 0 0;
  min-height: 0;
}
.bucket-count,
.bucket-label {
  font-size: 11px;
  color: #64748b;
}
.categories {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.category-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
}
.category-name {
  font-weight: 600;
  color: #1e293b;
}
.category-range {
  color: #94a3b8;
}
.category-count {
  margin-left: auto;
  color: #475569;
}
.category-track {
  height: 6px;
  margin-top: 4px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}
.category-fill {
  height: 100%;
  background: #6366f1;
}
</style>

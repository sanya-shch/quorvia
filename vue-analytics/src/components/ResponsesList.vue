<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { ResponseListDto, ResponseScoreDto } from "@quorvia/shared-types";

defineProps<{
  data: ResponseListDto | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  selectedResponseId: string | null;
}>();

const emit = defineEmits<{
  (e: "select", responseId: string): void;
  (e: "update:page", page: number): void;
}>();

const { t, locale } = useI18n();

const formatDate = (iso: string) => new Date(iso).toLocaleString(locale.value);

const formatNumber = (value: number) =>
  value.toLocaleString(locale.value, { maximumFractionDigits: 2, useGrouping: false });

// "15 of 20 · Expert"; the maximum and the category are left out when there are none.
const scoreText = (score: ResponseScoreDto) => {
  const points =
    score.maxScore === null
      ? t("analytics.responsesList.score", { score: formatNumber(score.score) })
      : t("analytics.responsesList.scoreOf", {
          score: formatNumber(score.score),
          max: formatNumber(score.maxScore),
        });

  return score.categoryLabel ? `${points} · ${score.categoryLabel}` : points;
};
</script>

<template>
  <div class="list-panel">
    <h2 class="list-title">{{ t("analytics.responsesList.title") }}</h2>

    <div v-if="isLoading" class="state-text">{{ t("analytics.responsesList.loading") }}</div>
    <div v-else-if="error" class="state-text state-text--error">{{ t(error) }}</div>
    <div v-else-if="data?.data.length === 0" class="state-text">
      {{ t("analytics.responsesList.empty") }}
    </div>

    <div v-else-if="data" class="items">
      <button
        v-for="(resp, index) in data.data"
        :key="resp.id"
        type="button"
        class="item va-reveal"
        :class="{ 'item--selected': selectedResponseId === resp.id }"
        :style="{ '--motion-index': index }"
        @click="emit('select', resp.id)"
      >
        <div class="item-id">ID: {{ resp.id }}</div>
        <div class="item-date">
          {{ formatDate(resp.createdAt) }}
          <span v-if="resp.language" class="item-lang" :title="resp.language">{{
            resp.language.toUpperCase()
          }}</span>
        </div>
        <div v-if="resp.score" class="item-score" data-test="item-score">
          {{ scoreText(resp.score) }}
        </div>
      </button>
    </div>

    <div v-if="data && data.total > data.limit" class="pagination">
      <button
        type="button"
        class="page-btn"
        :disabled="page === 1"
        @click="emit('update:page', page - 1)"
      >
        {{ t("analytics.responsesList.back") }}
      </button>
      <span class="page-label">{{ t("analytics.responsesList.pageLabel", { page }) }}</span>
      <button
        type="button"
        class="page-btn"
        :disabled="page * data.limit >= data.total"
        @click="emit('update:page', page + 1)"
      >
        {{ t("analytics.responsesList.next") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.list-panel {
  background: var(--color-white, #fff);
  border: 1px solid var(--color-slate-200, #e2e8f0);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.list-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-slate-500, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0 4px;
  margin: 0;
}
.state-text {
  text-align: center;
  padding: 24px 0;
  color: var(--color-slate-500, #64748b);
  font-size: 12px;
}
.state-text--error {
  color: var(--color-rose-700, #be123c);
}
.items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.item {
  width: 100%;
  text-align: left;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-slate-200, #e2e8f0) 60%, transparent);
  background: var(--color-slate-50, #f8fafc);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-slate-700, #334155);
  cursor: pointer;
  transition: all 0.15s;
}
.item:hover {
  background: var(--color-slate-100, #f1f5f9);
  border-color: var(--color-indigo-600, #4f46e5);
}
.item:hover .item-id,
.item:hover .item-date,
.item:hover .item-score {
  color: var(--color-slate-700, #334155);
}
.item--selected {
  background: var(--color-indigo-600, #4f46e5);
  border-color: var(--color-indigo-600, #4f46e5);
  color: var(--color-on-solid, #fff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.item-id {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-date {
  margin-top: 4px;
  font-size: 10px;
  color: var(--color-slate-500, #64748b);
}
.item-lang {
  margin-left: 6px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--color-slate-200, #e2e8f0);
  color: var(--color-slate-600, #475569);
  font-weight: 600;
}
.item--selected .item-lang {
  background: color-mix(in srgb, var(--color-on-solid, #fff) 20%, transparent);
  color: var(--color-on-solid, #fff);
}
.item--selected .item-date {
  color: var(--color-indigo-200, #c7d2fe);
}
.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--color-slate-200, #e2e8f0);
  font-size: 12px;
}
.page-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-slate-200, #e2e8f0);
  background: var(--color-white, #fff);
  font-weight: 700;
  cursor: pointer;
}
.page-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.page-label {
  color: var(--color-slate-500, #64748b);
  font-weight: 500;
}
.item-score {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-indigo-600, #4f46e5);
}
</style>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { ResponseListDto } from "@quorvia/shared-types";

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
</script>

<template>
  <div class="list-panel">
    <h3 class="list-title">{{ t("analytics.responsesList.title") }}</h3>

    <div v-if="isLoading" class="state-text">{{ t("analytics.responsesList.loading") }}</div>
    <div v-else-if="error" class="state-text state-text--error">{{ t(error) }}</div>
    <div v-else-if="data?.data.length === 0" class="state-text">{{ t("analytics.responsesList.empty") }}</div>

    <div v-else-if="data" class="items">
      <button
        v-for="resp in data.data"
        :key="resp.id"
        type="button"
        class="item"
        :class="{ 'item--selected': selectedResponseId === resp.id }"
        @click="emit('select', resp.id)"
      >
        <div class="item-id">ID: {{ resp.id }}</div>
        <div class="item-date">{{ formatDate(resp.createdAt) }}</div>
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
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.list-title {
  font-size: 13px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0 4px;
  margin: 0;
}
.state-text {
  text-align: center;
  padding: 24px 0;
  color: #94a3b8;
  font-size: 12px;
}
.state-text--error {
  color: #e11d48;
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
  border: 1px solid #e2e8f099;
  background: #f8fafc;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s;
}
.item:hover {
  background: #f1f5f9;
}
.item--selected {
  background: #4f46e5;
  border-color: #4f46e5;
  color: white;
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
  color: #94a3b8;
}
.item--selected .item-date {
  color: #c7d2fe;
}
.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
  font-size: 12px;
}
.page-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: white;
  font-weight: 700;
  cursor: pointer;
}
.page-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.page-label {
  color: #94a3b8;
  font-weight: 500;
}
</style>

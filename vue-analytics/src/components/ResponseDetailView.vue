<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { ResponseDetailsDto } from "@quorvia/shared-types";

defineProps<{
  data: ResponseDetailsDto | null;
  isLoading: boolean;
  error: string | null;
}>();

const { t, locale } = useI18n();

const formatDate = (iso: string) => new Date(iso).toLocaleString(locale.value);
</script>

<template>
  <div v-if="isLoading" class="state-card state-card--muted">{{ t("analytics.common.loading") }}</div>
  <div v-else-if="error" class="state-card state-card--error">{{ t(error) }}</div>

  <div v-else-if="data" class="detail">
    <div class="detail-header">
      <div>
        <h3 class="detail-title">{{ t("analytics.responseDetail.title") }}</h3>
        <p class="detail-subtitle">{{ t("analytics.responseDetail.submittedAt", { date: formatDate(data.createdAt) }) }}</p>
      </div>
      <span class="detail-id">ID: {{ data.id }}</span>
    </div>

    <div class="answers">
      <div v-for="ans in data.answers" :key="ans.questionId" class="answer-row">
        <label class="answer-label">
          {{ ans.questionText }}
          <span v-if="ans.questionRequired" class="required-mark" :aria-label="t('analytics.common.requiredAriaLabel')">*</span>
        </label>

        <span v-if="ans.questionDescription" class="answer-description">{{ ans.questionDescription }}</span>

        <div class="answer-value">
          <div v-if="Array.isArray(ans.displayValue)" class="chips">
            <span v-for="(text, idx) in ans.displayValue" :key="idx" class="chip">{{ text }}</span>
          </div>
          <span
            v-else-if="ans.questionType === 'BOOLEAN'"
            class="value-box"
            :class="ans.rawValue ? 'value-box--true' : 'value-box--false'"
          >
            {{ ans.displayValue }}
          </span>
          <span v-else class="value-box value-box--default">{{ ans.displayValue }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.state-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  font-size: 13px;
}
.state-card--muted {
  color: #94a3b8;
}
.state-card--error {
  color: #e11d48;
}
.detail {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 24px;
}
.detail-header {
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 12px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.detail-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}
.detail-subtitle {
  font-size: 11px;
  color: #94a3b8;
  margin: 2px 0 0;
}
.detail-id {
  flex-shrink: 0;
  font-size: 10px;
  font-family: ui-monospace, monospace;
  background: #f1f5f9;
  color: #64748b;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}
.answers {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.answer-row {
  border-bottom: 1px solid #f8fafc;
  padding-bottom: 12px;
}
.answer-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.answer-label {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 4px;
}
.required-mark {
  color: #f43f5e;
}
.answer-description {
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  display: block;
}
.answer-value {
  font-size: 13px;
  margin-top: 6px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  background: #eef2ff;
  border: 1px solid #e0e7ff;
  color: #4338ca;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 8px;
}
.value-box {
  display: block;
  border-radius: 12px;
  border: 1px solid;
  padding: 8px 12px;
  font-weight: 500;
  color: #475569;
}
.value-box--default {
  background: #f8fafc;
  border-color: #e2e8f0cc;
}
.value-box--true {
  background: #ecfdf599;
  border-color: #d1fae5;
}
.value-box--false {
  background: #fff1f299;
  border-color: #ffe4e6;
}
</style>

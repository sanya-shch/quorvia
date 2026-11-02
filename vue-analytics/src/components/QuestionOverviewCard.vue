<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { isScaleQuestionType, type QuestionOverview } from "@quorvia/shared-types";

const props = defineProps<{
  question: QuestionOverview;
  totalResponses: number;
}>();

defineEmits<{ (e: "open-detail", questionId: string): void }>();

const { t } = useI18n();

const hasVisibilityInfo = computed(
  () => (props.question.hiddenCount ?? 0) > 0 || (props.question.skippedCount ?? 0) > 0,
);

const isScale = computed(() => isScaleQuestionType(props.question.type));

const topPreview = computed(() => props.question.preview?.slice(0, 3) ?? []);
const topDistribution = computed(() => props.question.distribution ?? []);
const maxDistributionCount = computed(
  () => Math.max(1, ...topDistribution.value.map((d) => d.count)),
);
</script>

<template>
  <button type="button" class="card" @click="$emit('open-detail', question.id)">
    <div class="card-header">
      <span class="card-title">{{ question.text || t("analytics.common.untitledQuestion") }}</span>
      <span class="card-type">{{ question.type }}</span>
    </div>

    <div v-if="hasVisibilityInfo" class="visibility-badges">
      <span v-if="(question.hiddenCount ?? 0) > 0" class="badge badge--hidden">
        {{ t("analytics.questionCard.hiddenByCondition", { count: question.hiddenCount }) }}
      </span>
      <span v-if="(question.skippedCount ?? 0) > 0" class="badge badge--skipped">
        {{ t("analytics.questionCard.shownButSkipped", { count: question.skippedCount }) }}
      </span>
    </div>

    <div class="card-body">
      <template v-if="isScale && question.stats">
        <div class="stats-row">
          <div class="stat">
            <span class="stat-value">{{ question.stats.avg.toFixed(1) }}</span>
            <span class="stat-label">{{ t("analytics.common.avg") }}</span>
          </div>
          <div v-if="question.nps" class="stat">
            <span class="stat-value">{{ question.nps.score ?? "—" }}</span>
            <span class="stat-label">{{ t("analytics.common.nps") }}</span>
          </div>
        </div>
        <div v-if="topDistribution.length" class="histogram">
          <div
            v-for="d in topDistribution"
            :key="d.optionId"
            class="hist-col"
            :title="d.text + ': ' + d.count"
          >
            <div class="hist-bar-wrap">
              <div class="hist-bar" :style="{ height: (d.count / maxDistributionCount) * 100 + '%' }" />
            </div>
            <span class="hist-label">{{ d.text }}</span>
          </div>
        </div>
      </template>

      <template v-else-if="question.type === 'NUMBER' && question.stats">
        <div class="stats-row">
          <div class="stat">
            <span class="stat-value">{{ question.stats.avg.toFixed(1) }}</span>
            <span class="stat-label">{{ t("analytics.common.avg") }}</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ question.stats.min }}</span>
            <span class="stat-label">{{ t("analytics.common.min") }}</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ question.stats.max }}</span>
            <span class="stat-label">{{ t("analytics.common.max") }}</span>
          </div>
        </div>
      </template>

      <template v-else-if="question.type === 'BOOLEAN'">
        <div class="bool-bar">
          <div
            class="bool-bar-fill"
            :style="{
              width:
                ((question.trueCount ?? 0) / Math.max(1, (question.trueCount ?? 0) + (question.falseCount ?? 0))) *
                  100 +
                '%',
            }"
          />
        </div>
        <div class="bool-legend">
          <span>{{ t("analytics.common.booleanYes", { count: question.trueCount ?? 0 }) }}</span>
          <span>{{ t("analytics.common.booleanNo", { count: question.falseCount ?? 0 }) }}</span>
        </div>
      </template>

      <template v-else-if="(question.type === 'CHOICE_SINGLE' || question.type === 'CHOICE_MULTI') && topDistribution.length">
        <div v-for="opt in topDistribution" :key="opt.optionId" class="dist-row">
          <span class="dist-label">{{ opt.text }}</span>
          <div class="dist-bar">
            <div class="dist-bar-fill" :style="{ width: (opt.count / maxDistributionCount) * 100 + '%' }" />
          </div>
          <span class="dist-count">{{ opt.count }}</span>
        </div>
      </template>

      <template v-else-if="(question.type === 'TEXT' || question.type === 'DATE') && topPreview.length">
        <div v-for="p in topPreview" :key="p.value" class="preview-row">
          <span class="preview-value">«{{ p.value }}»</span>
          <span class="preview-count">×{{ p.count }}</span>
        </div>
      </template>

      <p v-else class="no-data">{{ t("analytics.questionCard.noData") }}</p>
    </div>
  </button>
</template>

<style scoped>
.card {
  display: block;
  width: 100%;
  text-align: left;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 20px;
  cursor: pointer;
  transition: border-color 0.15s;
  font-family: inherit;
}
.card:hover {
  border-color: #cbd5e1;
}
.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.card-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}
.card-type {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 999px;
}
.visibility-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}
.badge--hidden {
  background: #f1f5f9;
  color: #64748b;
}
.badge--skipped {
  background: #fef3c7;
  color: #92400e;
}
.card-body {
  margin-top: 12px;
}
.stats-row {
  display: flex;
  gap: 20px;
}
.stat {
  display: flex;
  flex-direction: column;
}
.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #4f46e5;
}
.stat-label {
  font-size: 11px;
  color: #94a3b8;
}
.histogram {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  margin-top: 12px;
}
.hist-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.hist-bar-wrap {
  width: 100%;
  height: 40px;
  display: flex;
  align-items: flex-end;
}
.hist-bar {
  width: 100%;
  min-height: 2px;
  background: #4f46e5;
  border-radius: 3px 3px 0 0;
}
.hist-label {
  font-size: 10px;
  color: #94a3b8;
}
.bool-bar {
  height: 8px;
  background: #fee2e2;
  border-radius: 999px;
  overflow: hidden;
}
.bool-bar-fill {
  height: 100%;
  background: #4f46e5;
}
.bool-legend {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}
.dist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
}
.dist-label {
  flex-shrink: 0;
  width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #475569;
}
.dist-bar {
  flex: 1;
  height: 8px;
  background: #f1f5f9;
  border-radius: 999px;
  overflow: hidden;
}
.dist-bar-fill {
  height: 100%;
  background: #4f46e5;
}
.dist-count {
  flex-shrink: 0;
  width: 24px;
  text-align: right;
  color: #94a3b8;
  font-size: 11px;
}
.preview-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #475569;
  margin-bottom: 4px;
}
.preview-count {
  color: #94a3b8;
}
.no-data {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
}
</style>

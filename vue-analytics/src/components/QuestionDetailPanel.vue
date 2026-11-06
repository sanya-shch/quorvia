<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { QuestionAnalyticsDto, RankingOptionStats } from "@quorvia/shared-types";

const props = defineProps<{
  data: QuestionAnalyticsDto | null;
  isLoading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ (e: "close"): void }>();

const { t } = useI18n();

const closeButtonRef = ref<HTMLButtonElement | null>(null);

// Best (lowest average position) on top; options without rankings go last.
const sortedRanking = computed<RankingOptionStats[]>(() =>
  [...(props.data?.ranking ?? [])].sort(
    (a, b) =>
      (a.avgPosition ?? Number.POSITIVE_INFINITY) - (b.avgPosition ?? Number.POSITIVE_INFINITY),
  ),
);

// Bar: position 1 is full, the last one is empty.
const rankScore = (item: RankingOptionStats): number => {
  const n = props.data?.ranking?.length ?? 0;
  return item.avgPosition === null || n < 2 ? 0 : ((n - item.avgPosition) / (n - 1)) * 100;
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape") emit("close");
};

onMounted(() => {
  document.addEventListener("keydown", handleKeydown);
  document.body.style.overflow = "hidden";
  closeButtonRef.value?.focus();
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown);
  document.body.style.overflow = "";
});
</script>

<template>
  <div class="overlay" role="presentation" @click.self="$emit('close')">
    <aside class="panel" role="dialog" aria-modal="true" aria-labelledby="question-detail-title">
      <button
        ref="closeButtonRef"
        type="button"
        class="close-btn"
        :aria-label="t('analytics.detailPanel.close')"
        @click="$emit('close')"
      >
        <span aria-hidden="true">✕</span>
      </button>

      <div v-if="isLoading" class="state-msg" role="status">{{ t("analytics.common.loading") }}</div>
      <div v-else-if="error" class="state-msg state-msg--error" role="alert">{{ t(error) }}</div>

      <template v-else-if="data">
        <h2 id="question-detail-title" class="title">{{ data.question.text || t("analytics.common.untitledQuestion") }}</h2>
        <p v-if="data.question.description" class="description">{{ data.question.description }}</p>
        <p class="total">{{ t("analytics.detailPanel.totalAnswers", { count: data.totalAnswers }) }}</p>

        <div v-if="data.stats" class="stats-row">
          <div class="stat"><span class="stat-value">{{ data.stats.avg.toFixed(2) }}</span><span class="stat-label">{{ t("analytics.common.avg") }}</span></div>
          <div class="stat"><span class="stat-value">{{ data.stats.min }}</span><span class="stat-label">{{ t("analytics.common.min") }}</span></div>
          <div class="stat"><span class="stat-value">{{ data.stats.max }}</span><span class="stat-label">{{ t("analytics.common.max") }}</span></div>
        </div>

        <div v-if="data.matrix" class="matrix-wrap">
          <table class="matrix">
            <thead>
              <tr>
                <th scope="col" />
                <th v-for="column in data.matrix.columns" :key="column.id" scope="col">
                  {{ column.text }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in data.matrix.rows" :key="row.rowId">
                <th scope="row">{{ row.text }}</th>
                <td
                  v-for="(count, i) in row.counts"
                  :key="data.matrix.columns[i].id"
                  :style="{ backgroundColor: `rgba(79, 70, 229, ${(row.answered ? count / row.answered : 0) * 0.35})` }"
                >
                  <strong>{{ count }}</strong>
                  <small>{{ row.answered ? Math.round((count / row.answered) * 100) : 0 }}%</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="data.ranking" class="distribution">
          <p class="answers-title">
            {{ t("analytics.common.rankingRanked", { count: data.rankedCount ?? 0 }) }}
          </p>
          <div v-for="(item, i) in sortedRanking" :key="item.optionId" class="dist-row">
            <span class="dist-label">{{ i + 1 }}. {{ item.text }}</span>
            <div class="dist-bar">
              <div class="dist-bar-fill" :style="{ width: rankScore(item) + '%' }" />
            </div>
            <span class="dist-count" :title="t('analytics.common.rankingFirst') + ': ' + item.positions[0]">
              {{ item.avgPosition === null ? "—" : item.avgPosition.toFixed(2) }}
            </span>
          </div>
        </div>

        <div v-if="data.nps" class="stats-row">
          <div class="stat"><span class="stat-value">{{ data.nps.score ?? "—" }}</span><span class="stat-label">{{ t("analytics.common.nps") }}</span></div>
          <div class="stat"><span class="stat-value">{{ data.nps.promoters }}</span><span class="stat-label">{{ t("analytics.common.npsPromoters") }}</span></div>
          <div class="stat"><span class="stat-value">{{ data.nps.passives }}</span><span class="stat-label">{{ t("analytics.common.npsPassives") }}</span></div>
          <div class="stat"><span class="stat-value">{{ data.nps.detractors }}</span><span class="stat-label">{{ t("analytics.common.npsDetractors") }}</span></div>
        </div>

        <div v-if="typeof data.trueCount === 'number'" class="bool-legend">
          <span>{{ t("analytics.common.booleanYes", { count: data.trueCount }) }}</span>
          <span>{{ t("analytics.common.booleanNo", { count: data.falseCount }) }}</span>
        </div>

        <div v-if="data.distribution?.length" class="distribution">
          <div v-for="row in data.distribution" :key="row.optionId || String(row.value)" class="dist-row">
            <span class="dist-label">{{ row.text || row.value }}</span>
            <div class="dist-bar">
              <div
                class="dist-bar-fill"
                :style="{ width: (row.count / Math.max(1, ...(data.distribution ?? []).map((d) => d.count))) * 100 + '%' }"
              />
            </div>
            <span class="dist-count">{{ row.count }}</span>
          </div>
        </div>

        <div v-if="data.otherAnswers?.length" class="answers-list">
          <p class="answers-title">{{ t("analytics.detailPanel.otherAnswers") }}</p>
          <ul>
            <li v-for="(a, i) in data.otherAnswers" :key="i">«{{ a.value }}» ×{{ a.count }}</li>
          </ul>
        </div>

        <div v-if="data.answers?.length" class="answers-list">
          <p class="answers-title">{{ t("analytics.detailPanel.allAnswers") }}</p>
          <ul>
            <li v-for="(a, i) in data.answers" :key="i">{{ a }}</li>
          </ul>
        </div>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  justify-content: flex-end;
  z-index: 50;
}
.panel {
  width: min(420px, 90vw);
  height: 100%;
  background: white;
  padding: 28px 24px;
  overflow-y: auto;
  position: relative;
  box-shadow: -8px 0 24px rgba(15, 23, 42, 0.08);
}
.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  border: none;
  background: #f1f5f9;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  cursor: pointer;
  color: #64748b;
  font-size: 12px;
}
.state-msg {
  margin-top: 60px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}
.state-msg--error {
  color: #dc2626;
}
.title {
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 4px;
  padding-right: 32px;
}
.description {
  font-size: 12px;
  color: #94a3b8;
  margin: 0 0 12px;
}
.total {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 20px;
}
.stats-row {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
}
.stat {
  display: flex;
  flex-direction: column;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #4f46e5;
}
.stat-label {
  font-size: 11px;
  color: #94a3b8;
}
.bool-legend {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #475569;
  margin-bottom: 20px;
}
.distribution {
  margin-bottom: 20px;
}
.matrix-wrap {
  overflow-x: auto;
  margin-bottom: 16px;
}
.matrix {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.matrix th,
.matrix td {
  padding: 8px;
  text-align: center;
  border-top: 1px solid #f1f5f9;
}
.matrix th[scope="row"] {
  text-align: left;
  font-weight: 500;
  color: #334155;
}
.matrix th[scope="col"] {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  border-top: 0;
}
.matrix small {
  display: block;
  color: #64748b;
  font-size: 11px;
}
.dist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}
.dist-label {
  flex-shrink: 0;
  width: 110px;
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
  width: 28px;
  text-align: right;
  color: #94a3b8;
  font-size: 11px;
}
.answers-title {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  margin-bottom: 8px;
}
.answers-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 320px;
  overflow-y: auto;
}
.answers-list li {
  font-size: 12px;
  color: #475569;
  padding: 6px 0;
  border-bottom: 1px solid #f1f5f9;
}
</style>

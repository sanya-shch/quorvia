<script setup lang="ts">

import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useFormAnalytics } from "./composables/useFormAnalytics";
import { useFormPaths } from "./composables/useFormPaths";
import { useFormFunnel } from "./composables/useFormFunnel";
import { useQuestionAnalytics } from "./composables/useQuestionAnalytics";
import { useResponsesList } from "./composables/useResponsesList";
import { useResponseDetail } from "./composables/useResponseDetail";
import QuestionOverviewCard from "./components/QuestionOverviewCard.vue";
import PathsDiagram from "./components/PathsDiagram.vue";
import FunnelChart from "./components/FunnelChart.vue";
import QuestionDetailPanel from "./components/QuestionDetailPanel.vue";
import ResponsesList from "./components/ResponsesList.vue";
import ResponseDetailView from "./components/ResponseDetailView.vue";
import ExportMenu from "./components/ExportMenu.vue";
import { setAuthBridge } from "./api/client";

const props = defineProps<{
  formId: string;
  apiBaseUrl?: string;
  locale?: string;
  // Міст автентифікації від React-хоста (токен лише в пам'яті хоста).
  getAccessToken?: () => string | null;
  refreshAccessToken?: () => Promise<string | null>;
}>();

const { t, locale } = useI18n();

// React-хост (VueAnalyticsHost.tsx) передає реактивний `locale` проп через reactive() root-props
// цей watch підхоплює зміну мови користувачем "на льоту", без перемонтування Vue-застосунку.
watch(
  () => props.locale,
  (newLocale) => {
    if (newLocale === "uk" || newLocale === "en") {
      locale.value = newLocale;
    }
  },
  { immediate: true },
);

const apiBaseUrl = props.apiBaseUrl || "http://localhost:5001/api";

// Має виконатись ДО створення composables нижче - вони одразу роблять запити.
setAuthBridge(
  props.getAccessToken
    ? { getAccessToken: props.getAccessToken, refreshAccessToken: props.refreshAccessToken }
    : null,
);

const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useFormAnalytics(
  apiBaseUrl,
  props.formId,
);
const { data: paths, isLoading: pathsLoading, error: pathsError } = useFormPaths(apiBaseUrl, props.formId);
const { data: funnel, isLoading: funnelLoading, error: funnelError } = useFormFunnel(apiBaseUrl, props.formId);
const { data: detail, isLoading: detailLoading, error: detailError, load: loadDetail } =
  useQuestionAnalytics(apiBaseUrl, props.formId);

const activeQuestionId = ref<string | null>(null);

const openDetail = (questionId: string) => {
  activeQuestionId.value = questionId;
  loadDetail(questionId);
};
const closeDetail = () => {
  activeQuestionId.value = null;
};

const activeTab = ref<"overview" | "responses">("overview");

const {
  data: responsesList,
  page: responsesPage,
  isLoading: responsesListLoading,
  error: responsesListError,
} = useResponsesList(apiBaseUrl, props.formId);

const {
  data: responseDetail,
  isLoading: responseDetailLoading,
  error: responseDetailError,
  load: loadResponseDetail,
} = useResponseDetail(apiBaseUrl, props.formId);

const selectedResponseId = ref<string | null>(null);

const selectResponse = (responseId: string) => {
  selectedResponseId.value = responseId;
  loadResponseDetail(responseId);
};
</script>

<template>
  <div class="analytics-root">
    <header class="header">
      <div>
        <h1 class="page-title">{{ t("analytics.header.title") }}</h1>
        <p class="page-subtitle">{{ t("analytics.header.subtitle") }}</p>
      </div>
      <div class="header-right">
        <div v-if="analytics" class="total-badge">
          {{ t("analytics.header.totalResponses", { count: analytics.totalResponses }) }}
        </div>
        <ExportMenu v-if="activeTab === 'responses'" :api-base-url="apiBaseUrl" :form-id="formId" />
      </div>
    </header>

    <nav class="tabs">
      <button
        type="button"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === 'overview' }"
        @click="activeTab = 'overview'"
      >
        {{ t("analytics.tabs.overview") }}
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === 'responses' }"
        @click="activeTab = 'responses'"
      >
        {{ t("analytics.tabs.responses") }}
      </button>
    </nav>

    <template v-if="activeTab === 'overview'">
      <section class="funnel-section">
        <h2 class="section-title">{{ t("analytics.funnel.sectionTitle") }}</h2>

        <div v-if="funnelLoading" class="state-msg">{{ t("analytics.funnel.loading") }}</div>
        <div v-else-if="funnelError" class="state-msg state-msg--error">{{ t(funnelError) }}</div>
        <FunnelChart v-else-if="funnel" :funnel="funnel" />
      </section>

      <section v-if="analyticsLoading" class="state-msg">{{ t("analytics.analyticsSection.loading") }}</section>
      <section v-else-if="analyticsError" class="state-msg state-msg--error">{{ t(analyticsError) }}</section>

      <template v-else-if="analytics">
        <section v-if="analytics.totalResponses === 0" class="empty-state">
          {{ t("analytics.analyticsSection.emptyState") }}
        </section>

        <template v-else>
          <section class="cards-grid">
            <QuestionOverviewCard
              v-for="q in analytics.questions"
              :key="q.id"
              :question="q"
              :total-responses="analytics.totalResponses"
              @open-detail="openDetail"
            />
          </section>

          <section class="paths-section">
            <h2 class="section-title">{{ t("analytics.paths.sectionTitle") }}</h2>
            <p class="section-hint">{{ t("analytics.paths.sectionHint") }}</p>

            <div v-if="pathsLoading" class="state-msg">{{ t("analytics.paths.loading") }}</div>
            <div v-else-if="pathsError" class="state-msg state-msg--error">{{ t(pathsError) }}</div>
            <PathsDiagram
              v-else-if="paths"
              :nodes="paths.nodes"
              :edges="paths.edges"
              :total-responses="paths.totalResponses"
            />
          </section>
        </template>
      </template>

      <QuestionDetailPanel
        v-if="activeQuestionId"
        :data="detail"
        :is-loading="detailLoading"
        :error="detailError"
        @close="closeDetail"
      />
    </template>

    <section v-else class="responses-tab">
      <div class="responses-grid">
        <ResponsesList
          :data="responsesList"
          :is-loading="responsesListLoading"
          :error="responsesListError"
          :page="responsesPage"
          :selected-response-id="selectedResponseId"
          @select="selectResponse"
          @update:page="(p) => (responsesPage = p)"
        />

        <div class="responses-detail-col">
          <ResponseDetailView
            v-if="selectedResponseId"
            :data="responseDetail"
            :is-loading="responseDetailLoading"
            :error="responseDetailError"
          />
          <div v-else class="placeholder">
            {{ t("analytics.responseDetail.placeholder") }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.analytics-root {
  min-height: 100vh;
  background: #f8fafc;
  padding: 32px 24px 64px;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    sans-serif;
}
.header {
  max-width: 960px;
  margin: 0 auto 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-title {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}
.page-subtitle {
  font-size: 12px;
  color: #94a3b8;
  margin: 2px 0 0;
}
.total-badge {
  background: #eef2ff;
  color: #4f46e5;
  font-size: 13px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 999px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tabs {
  max-width: 960px;
  margin: 0 auto 24px;
  display: flex;
  gap: 4px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 12px;
  width: fit-content;
}
.tab-btn {
  border: none;
  background: transparent;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}
.tab-btn:hover {
  color: #334155;
}
.tab-btn--active {
  background: white;
  color: #4f46e5;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.responses-tab {
  max-width: 960px;
  margin: 0 auto;
}
.responses-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  align-items: start;
}
@media (min-width: 768px) {
  .responses-grid {
    grid-template-columns: 1fr 2fr;
  }
}
.placeholder {
  height: 192px;
  border: 2px dashed #e2e8f0;
  background: white;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-weight: 500;
  font-size: 13px;
  text-align: center;
  padding: 0 16px;
}
.state-msg {
  max-width: 960px;
  margin: 40px auto;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}
.state-msg--error {
  color: #dc2626;
}
.empty-state {
  max-width: 960px;
  margin: 60px auto;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}
.cards-grid {
  max-width: 960px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.paths-section {
  max-width: 960px;
  margin: 40px auto 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 28px;
}
.funnel-section {
  max-width: 960px;
  margin: 0 auto 32px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 28px;
}
.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 4px;
}
.section-hint {
  font-size: 12px;
  color: #94a3b8;
  margin: 0 0 20px;
}
</style>

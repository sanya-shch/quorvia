<script setup lang="ts">
import "./motion.css";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useFormAnalytics } from "./composables/useFormAnalytics";
import { useFormPaths } from "./composables/useFormPaths";
import { useFormFunnel } from "./composables/useFormFunnel";
import { useFormSummary } from "./composables/useFormSummary";
import { useFormMeta } from "./composables/useFormMeta";
import {
  isValidRange,
  resolvePeriod,
  type PeriodPreset,
  type PeriodRange,
  type QueryParams,
} from "./period";
import { useQuestionAnalytics } from "./composables/useQuestionAnalytics";
import { useResponsesList } from "./composables/useResponsesList";
import { useResponseDetail } from "./composables/useResponseDetail";
import QuestionOverviewCard from "./components/QuestionOverviewCard.vue";
import CompletionFunnel from "./components/CompletionFunnel.vue";
import KpiCards from "./components/KpiCards.vue";
import TrendChart from "./components/TrendChart.vue";
import PeriodPicker from "./components/PeriodPicker.vue";
import JourneyPanel from "./components/JourneyPanel.vue";
import QuestionDetailPanel from "./components/QuestionDetailPanel.vue";
import ResponsesList from "./components/ResponsesList.vue";
import ResponseDetailView from "./components/ResponseDetailView.vue";
import ExportMenu from "./components/ExportMenu.vue";
import ScoreSummary from "./components/ScoreSummary.vue";
import { setAuthBridge } from "./api/client";

const props = defineProps<{
  formId: string;
  apiBaseUrl?: string;
  locale?: string;
  // False on a deployment without exports (the React host decides); the menu is then not shown.
  exportEnabled?: boolean;
  // Auth bridge from the React host (the token lives only in the host's memory).
  getAccessToken?: () => string | null;
  refreshAccessToken?: () => Promise<string | null>;
  // Inside the form workspace the page title, status and the Overview/Responses tabs belong to
  // the React shell: the app then shows only the period picker, the export menu and the content.
  embedded?: boolean;
  initialTab?: "overview" | "responses";
  // Opens this response in the Responses tab right away (a link from the form overview).
  initialResponseId?: string;
}>();

const { t, locale } = useI18n();

// The React host (VueAnalyticsHost.tsx) passes a reactive `locale` prop through the reactive()
// root props; this watch picks up the user's language change on the fly, without remounting the Vue app.
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

// Must run BEFORE the composables below are created: they make requests right away.
setAuthBridge(
  props.getAccessToken
    ? { getAccessToken: props.getAccessToken, refreshAccessToken: props.refreshAccessToken }
    : null,
);

// The period every block of the overview is limited to. The default is the last 30 days, like
// the reference design; "all time" is one click away. A half-typed or reversed custom range is
// not applied (the picker shows why), the previous valid period stays on screen.
const preset = ref<PeriodPreset>("30d");
const custom = ref<PeriodRange>({});
const periodParams = ref<QueryParams>(resolvePeriod("30d", new Date()));

watch(
  [preset, custom],
  () => {
    if (preset.value === "custom" && !isValidRange(custom.value)) return;
    periodParams.value = resolvePeriod(preset.value, new Date(), custom.value);
  },
  { deep: true },
);

const {
  data: analytics,
  isLoading: analyticsLoading,
  error: analyticsError,
} = useFormAnalytics(apiBaseUrl, props.formId, periodParams);
const {
  data: paths,
  isLoading: pathsLoading,
  error: pathsError,
} = useFormPaths(apiBaseUrl, props.formId, periodParams);
const {
  data: funnel,
  isLoading: funnelLoading,
  error: funnelError,
} = useFormFunnel(apiBaseUrl, props.formId, periodParams);
const {
  data: summary,
  isLoading: summaryLoading,
  error: summaryError,
} = useFormSummary(apiBaseUrl, props.formId, periodParams);
const { data: meta } = useFormMeta(apiBaseUrl, props.formId);
const {
  data: detail,
  isLoading: detailLoading,
  error: detailError,
  load: loadDetail,
} = useQuestionAnalytics(apiBaseUrl, props.formId, periodParams);

// Only these questions have a detail panel (files and calculations are summarized on the card).
const inspectableIds = computed(
  () =>
    analytics.value?.questions
      .filter((q) => q.type !== "FILE" && q.type !== "CALCULATION")
      .map((q) => q.id) ?? [],
);

const expandedInsights = ref(false);

const activeQuestionId = ref<string | null>(null);

const openDetail = (questionId: string) => {
  activeQuestionId.value = questionId;
  loadDetail(questionId);
};
const closeDetail = () => {
  activeQuestionId.value = null;
};

const activeTab = ref<"overview" | "responses">(props.initialTab ?? "overview");

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

if (props.initialResponseId) selectResponse(props.initialResponseId);

// "Oct 24, 2026" in the interface language; the form meta is decoration, so it may be absent.
const updatedLabel = computed(() =>
  meta.value?.updatedAt
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: "medium" }).format(
        new Date(meta.value.updatedAt),
      )
    : null,
);

const hasPeriodFilter = computed(() => preset.value !== "all");
</script>

<template>
  <div class="analytics-root">
    <header class="header" :class="{ 'header--embedded': embedded }">
      <div v-if="!embedded" class="title-block">
        <div class="meta-row">
          <span
            v-if="meta && meta.isPublished !== undefined"
            class="status"
            :class="meta.isPublished ? 'status--published' : 'status--draft'"
          >
            {{ meta.isPublished ? t("analytics.header.published") : t("analytics.header.draft") }}
          </span>
          <span v-if="meta?.version" class="meta-text">
            {{ t("analytics.header.version", { version: meta.version }) }}
            <template v-if="updatedLabel">
              · {{ t("analytics.header.updated", { date: updatedLabel }) }}</template
            >
          </span>
        </div>
        <h1 class="page-title">{{ meta?.title || t("analytics.header.title") }}</h1>
        <p class="page-subtitle">{{ t("analytics.header.subtitle") }}</p>
      </div>

      <div class="header-right">
        <PeriodPicker
          v-if="activeTab === 'overview'"
          v-model:preset="preset"
          v-model:custom="custom"
        />
        <ExportMenu v-if="exportEnabled !== false" :api-base-url="apiBaseUrl" :form-id="formId" />
      </div>
    </header>

    <nav v-if="!embedded" class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === 'overview' }"
        :aria-selected="activeTab === 'overview'"
        @click="activeTab = 'overview'"
      >
        {{ t("analytics.tabs.overview") }}
      </button>
      <button
        type="button"
        role="tab"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === 'responses' }"
        :aria-selected="activeTab === 'responses'"
        @click="activeTab = 'responses'"
      >
        {{ t("analytics.tabs.responses") }}
      </button>
    </nav>

    <template v-if="activeTab === 'overview'">
      <section class="kpi-section" :aria-label="t('analytics.kpi.sectionLabel')">
        <KpiCards :summary="summary" :is-loading="summaryLoading" :error="summaryError" />
      </section>

      <section
        v-if="summary && summary.daily.length > 1"
        class="block-section va-reveal"
        style="--motion-index: 2"
      >
        <TrendChart :daily="summary.daily" />
      </section>

      <section class="card-section va-reveal" style="--motion-index: 3">
        <h2 class="section-title">{{ t("analytics.funnel.sectionTitle") }}</h2>

        <div v-if="funnelLoading && !funnel" class="state-msg">
          {{ t("analytics.funnel.loading") }}
        </div>
        <div v-else-if="funnelError" class="state-msg state-msg--error">{{ t(funnelError) }}</div>
        <CompletionFunnel
          v-else-if="funnel"
          :funnel="funnel"
          :inspectable-ids="inspectableIds"
          @open-question="openDetail"
        />
      </section>

      <section v-if="analyticsLoading && !analytics" class="state-msg">
        {{ t("analytics.analyticsSection.loading") }}
      </section>
      <section v-else-if="analyticsError" class="state-msg state-msg--error">
        {{ t(analyticsError) }}
      </section>

      <template v-else-if="analytics">
        <section
          v-if="analytics.totalResponses === 0"
          class="empty-state va-reveal"
          style="--motion-index: 4"
        >
          {{
            hasPeriodFilter
              ? t("analytics.analyticsSection.emptyPeriod")
              : t("analytics.analyticsSection.emptyState")
          }}
        </section>

        <template v-else>
          <section
            v-if="analytics.scoring"
            class="score-section va-reveal"
            style="--motion-index: 4"
          >
            <h2 class="section-title">{{ t("analytics.scoring.sectionTitle") }}</h2>
            <p class="section-hint">{{ t("analytics.scoring.sectionHint") }}</p>
            <ScoreSummary :scoring="analytics.scoring" />
          </section>

          <section class="questions-section va-reveal" style="--motion-index: 5">
            <div class="section-head">
              <div>
                <h2 class="section-title">{{ t("analytics.questions.sectionTitle") }}</h2>
                <p class="section-hint section-hint--tight">
                  {{ t("analytics.questions.sectionHint", { count: analytics.totalResponses }) }}
                </p>
              </div>
              <button
                type="button"
                class="outline-btn"
                :aria-pressed="expandedInsights"
                @click="expandedInsights = !expandedInsights"
              >
                {{
                  expandedInsights
                    ? t("analytics.questions.collapseAll")
                    : t("analytics.questions.expandAll")
                }}
              </button>
            </div>

            <div class="cards-grid">
              <QuestionOverviewCard
                v-for="q in analytics.questions"
                :key="q.id"
                :question="q"
                :total-responses="analytics.totalResponses"
                :expanded="expandedInsights"
                @open-detail="openDetail"
              />
            </div>
          </section>
        </template>
      </template>

      <section class="card-section va-reveal" style="--motion-index: 6">
        <div class="section-head">
          <div>
            <h2 class="section-title">{{ t("analytics.paths.sectionTitle") }}</h2>
            <p class="section-hint section-hint--tight">{{ t("analytics.journey.sectionHint") }}</p>
          </div>
        </div>

        <JourneyPanel
          :api-base-url="apiBaseUrl"
          :form-id="formId"
          :period-params="periodParams"
          :paths="paths"
          :paths-loading="pathsLoading"
          :paths-error="pathsError"
          :inspectable-ids="inspectableIds"
          @open-question="openDetail"
        />
      </section>

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
            :api-base-url="apiBaseUrl"
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
  background: var(--color-slate-50, #f8fafc);
  padding: 28px 20px 64px;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    sans-serif;
}
.analytics-root > * {
  max-width: 1120px;
  margin-left: auto;
  margin-right: auto;
}
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.status {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 999px;
}
.status--published {
  background: var(--color-emerald-600, #059669);
  color: var(--color-on-solid, #fff);
}
.status--draft {
  background: var(--color-slate-200, #e2e8f0);
  color: var(--color-slate-600, #475569);
}
.meta-text {
  font-size: 12px;
  color: var(--color-slate-500, #64748b);
}
.page-title {
  font-size: 28px;
  font-weight: 800;
  color: var(--color-slate-900, #0f172a);
  margin: 0;
  letter-spacing: -0.01em;
}
.page-subtitle {
  font-size: 14px;
  color: var(--color-slate-500, #64748b);
  margin: 4px 0 0;
}
.header--embedded {
  justify-content: flex-end;
}
.header-right {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.tabs {
  display: flex;
  gap: 4px;
  background: var(--color-slate-100, #f1f5f9);
  padding: 4px;
  border-radius: 12px;
  width: fit-content;
  margin-bottom: 20px;
}
.tab-btn {
  border: none;
  background: transparent;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-slate-500, #64748b);
  cursor: pointer;
  transition: all 0.15s;
}
.tab-btn:hover {
  color: var(--color-slate-700, #334155);
}
.tab-btn:focus-visible {
  outline: 2px solid var(--color-indigo-600, #4f46e5);
  outline-offset: 2px;
}
.tab-btn--active {
  background: var(--color-white, #fff);
  color: var(--color-indigo-600, #4f46e5);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.kpi-section {
  margin-bottom: 16px;
}
.block-section {
  margin-bottom: 16px;
}
.card-section {
  background: var(--color-white, #fff);
  border: 1px solid var(--color-slate-200, #e2e8f0);
  border-radius: 20px;
  padding: 22px;
  margin-top: 24px;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-slate-800, #1e293b);
  margin: 0 0 4px;
}
.section-hint {
  font-size: 12px;
  color: var(--color-slate-500, #64748b);
  margin: 0 0 20px;
}
.section-hint--tight {
  margin: 0;
}
.outline-btn {
  border: 1px solid var(--color-indigo-200, #c7d2fe);
  background: var(--color-white, #fff);
  color: var(--color-indigo-600, #4f46e5);
  font-size: 13px;
  font-weight: 700;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
}
.outline-btn:hover {
  background: var(--color-indigo-50, #eef2ff);
}
.outline-btn:focus-visible {
  outline: 2px solid var(--color-indigo-600, #4f46e5);
  outline-offset: 2px;
}
.questions-section {
  margin-top: 32px;
}
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.score-section {
  margin-top: 32px;
}
.state-msg {
  margin: 40px auto;
  text-align: center;
  color: var(--color-slate-500, #64748b);
  font-size: 14px;
}
.state-msg--error {
  color: var(--color-red-700, #b91c1c);
}
.empty-state {
  margin: 48px auto;
  text-align: center;
  color: var(--color-slate-500, #64748b);
  font-size: 14px;
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
  border: 2px dashed var(--color-slate-200, #e2e8f0);
  background: var(--color-white, #fff);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-slate-500, #64748b);
  font-weight: 500;
  font-size: 13px;
  text-align: center;
  padding: 0 16px;
}
@media (max-width: 640px) {
  .analytics-root {
    padding: 20px 12px 48px;
  }
  .page-title {
    font-size: 22px;
  }
  .card-section {
    padding: 16px;
    border-radius: 16px;
  }
  .header-right {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

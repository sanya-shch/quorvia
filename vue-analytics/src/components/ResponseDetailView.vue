<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { ResponseDetailsDto, UploadedFileDto } from "@quorvia/shared-types";
import { apiDownload } from "../api/client";

const props = defineProps<{
  data: ResponseDetailsDto | null;
  isLoading: boolean;
  error: string | null;
  apiBaseUrl: string;
}>();

const { t, locale } = useI18n();

// Files are private: the browser cannot just follow a link, the request needs the bearer token.
// So the file is fetched through the API client and handed to the browser as a download.
const downloadingId = ref<string | null>(null);
const downloadError = ref(false);

const downloadFile = async (file: UploadedFileDto) => {
  if (!props.data) return;

  downloadingId.value = file.id;
  downloadError.value = false;

  try {
    const { blob } = await apiDownload(
      props.apiBaseUrl,
      `/forms/${props.data.formId}/responses/${props.data.id}/files/${file.id}`,
    );
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch {
    downloadError.value = true;
  } finally {
    downloadingId.value = null;
  }
};

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatDate = (iso: string) => new Date(iso).toLocaleString(locale.value);

const formatNumber = (value: number) =>
  value.toLocaleString(locale.value, { maximumFractionDigits: 2, useGrouping: false });

// "Score: 15 of 20 (75%) · Expert"; the maximum, the percentage and the category are left out when
// there are none. null for a response that was not scored.
const scoreLine = computed(() => {
  const score = props.data?.score;

  if (!score) return null;

  const points =
    score.maxScore === null
      ? t("analytics.responseDetail.score", { score: formatNumber(score.score) })
      : t("analytics.responseDetail.scoreOf", {
          score: formatNumber(score.score),
          max: formatNumber(score.maxScore),
        });
  const percent = score.percent === null ? "" : ` (${formatNumber(score.percent)}%)`;
  const category = score.categoryLabel ? ` · ${score.categoryLabel}` : "";

  return `${points}${percent}${category}`;
});
</script>

<template>
  <!-- Nothing to show yet (the first open): the loader fades in after a short delay, so a fast
       load never flashes it. -->
  <div v-if="isLoading && !data" class="state-card state-card--muted state-card--delayed">
    {{ t("analytics.common.loading") }}
  </div>
  <div v-else-if="error" class="state-card state-card--error">{{ t(error) }}</div>

  <!-- Another response is loading: the previous one stays on screen, untouchable, and dims only if
       the wait is noticeable (see .detail--stale). `inert` is bound through an object on purpose:
       :inert="false" would render inert="false", and the mere presence of the attribute makes the
       element inert. -->
  <div
    v-else-if="data"
    class="detail va-reveal"
    :class="{ 'detail--stale': isLoading }"
    :aria-busy="isLoading"
    v-bind="isLoading ? { inert: true } : {}"
  >
    <div class="detail-header">
      <div>
        <h3 class="detail-title">{{ t("analytics.responseDetail.title") }}</h3>
        <p class="detail-subtitle">
          {{ t("analytics.responseDetail.submittedAt", { date: formatDate(data.createdAt) }) }}
        </p>
        <p v-if="data.language" class="detail-subtitle">
          {{ t("analytics.responseDetail.language", { language: data.language.toUpperCase() }) }}
        </p>
        <p v-if="scoreLine" class="detail-subtitle detail-score" data-test="detail-score">
          {{ scoreLine }}
        </p>
      </div>
      <span class="detail-id">ID: {{ data.id }}</span>
    </div>

    <div class="answers">
      <div v-for="ans in data.answers" :key="ans.questionId" class="answer-row">
        <label class="answer-label">
          {{ ans.questionText }}
          <span
            v-if="ans.questionRequired"
            class="required-mark"
            :aria-label="t('analytics.common.requiredAriaLabel')"
            >*</span
          >
        </label>

        <span v-if="ans.questionDescription" class="answer-description">{{
          ans.questionDescription
        }}</span>

        <div class="answer-value">
          <ul v-if="ans.questionType === 'FILE'" class="files">
            <li v-for="file in ans.files ?? []" :key="file.id" class="file-row">
              <span class="file-name">{{ file.name }}</span>
              <span class="file-size">{{ formatSize(file.size) }}</span>
              <button
                type="button"
                class="file-download"
                :disabled="downloadingId === file.id"
                :aria-label="t('analytics.responseDetail.downloadFile', { name: file.name })"
                @click="downloadFile(file)"
              >
                {{
                  downloadingId === file.id
                    ? t("analytics.responseDetail.downloading")
                    : t("analytics.responseDetail.download")
                }}
              </button>
            </li>
            <li v-if="!ans.files || ans.files.length === 0" class="file-empty">
              {{ t("analytics.responseDetail.noFiles") }}
            </li>
            <li v-if="downloadError" class="file-error" role="alert">
              {{ t("analytics.responseDetail.downloadFailed") }}
            </li>
          </ul>
          <div v-else-if="Array.isArray(ans.displayValue)" class="chips">
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
  background: var(--color-white, #fff);
  border: 1px solid var(--color-slate-200, #e2e8f0);
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  font-size: 13px;
}
.state-card--muted {
  color: var(--color-slate-400, #94a3b8);
}
.state-card--error {
  color: var(--color-rose-600, #e11d48);
}
/* "backwards" keeps it invisible during the delay, then it fades in: a load that finishes within
   ~200ms removes it while it is still transparent, so it never flashes. */
.state-card--delayed {
  animation: va-fade-in var(--motion-duration-fast, 160ms) ease-out 200ms backwards;
}
.files {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--color-slate-200, #e2e8f0);
  border-radius: 10px;
  font-size: 13px;
}
.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  var(--color-white, #fff)-space: nowrap;
  color: var(--color-slate-900, #0f172a);
  font-weight: 600;
}
.file-size {
  color: var(--color-slate-500, #64748b);
  font-size: 12px;
}
.file-download {
  border: 1px solid var(--color-indigo-200, #c7d2fe);
  background: var(--color-indigo-50, #eef2ff);
  color: var(--color-indigo-800, #3730a3);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.file-download:disabled {
  opacity: 0.6;
  cursor: default;
}
.file-empty {
  color: var(--color-slate-500, #64748b);
  font-size: 12px;
}
.file-error {
  color: var(--color-rose-700, #be123c);
  font-size: 12px;
  font-weight: 600;
}
.detail {
  background: var(--color-white, #fff);
  border: 1px solid var(--color-slate-200, #e2e8f0);
  border-radius: 16px;
  padding: 24px;
  transition: opacity 120ms ease;
}
/* The transition of the state being entered is the one that plays: dimming starts only after a
   150ms delay (a fast load swaps the content with no visible change at all), and coming back to
   full opacity uses the plain rule above, with no delay. */
.detail--stale {
  opacity: 0.55;
  pointer-events: none;
  transition: opacity var(--motion-duration-base, 260ms) ease 150ms;
}
.detail-header {
  border-bottom: 1px solid var(--color-slate-200, #e2e8f0);
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
  color: var(--color-slate-800, #1e293b);
  margin: 0;
}
.detail-subtitle {
  font-size: 11px;
  color: var(--color-slate-400, #94a3b8);
  margin: 2px 0 0;
}
.detail-id {
  flex-shrink: 0;
  font-size: 10px;
  font-family: ui-monospace, monospace;
  background: var(--color-slate-100, #f1f5f9);
  color: var(--color-slate-500, #64748b);
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-slate-200, #e2e8f0);
}
.answers {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.answer-row {
  border-bottom: 1px solid var(--color-slate-50, #f8fafc);
  padding-bottom: 12px;
}
.answer-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.answer-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-slate-800, #1e293b);
  display: flex;
  align-items: center;
  gap: 4px;
}
.required-mark {
  color: var(--color-rose-500, #f43f5e);
}
.answer-description {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-slate-400, #94a3b8);
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
  background: var(--color-indigo-50, #eef2ff);
  border: 1px solid var(--color-indigo-100, #e0e7ff);
  color: var(--color-indigo-700, #4338ca);
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
  color: var(--color-slate-600, #475569);
}
.value-box--default {
  background: var(--color-slate-50, #f8fafc);
  border-color: color-mix(in srgb, var(--color-slate-200, #e2e8f0) 80%, transparent);
}
.value-box--true {
  background: color-mix(in srgb, var(--color-emerald-50, #ecfdf5) 60%, transparent);
  border-color: var(--color-emerald-100, #d1fae5);
}
.value-box--false {
  background: color-mix(in srgb, var(--color-rose-50, #fff1f2) 60%, transparent);
  border-color: var(--color-rose-100, #ffe4e6);
}
.detail-score {
  font-weight: 600;
  color: var(--color-indigo-600, #4f46e5);
}
</style>

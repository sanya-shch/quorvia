<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { ExportFormat, ExportJobDto } from "@quorvia/shared-types";
import { useExportJobs } from "../composables/useExportJobs";

const props = defineProps<{
  apiBaseUrl: string;
  formId: string;
}>();

const { t } = useI18n();

const { jobs, isCreating, createExport, downloadExport } = useExportJobs(props.apiBaseUrl, props.formId);

const isOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);
const createError = ref(false);

const FORMAT_LABELS: Record<ExportFormat, string> = { CSV: "CSV", EXCEL: "Excel", PDF: "PDF" };
/**
 * Бекенд віддає в job.error лише стабільний код (EXPORT_FAILED,
 * EXPORT_TOO_LARGE), а не сирий текст помилки - тут він перекладається.
 * Невідомий/старий текст у БД показувати користувачу не можна, тому для
 * нього лишається загальний підпис статусу.
 */
const KNOWN_EXPORT_ERRORS = ["EXPORT_FAILED", "EXPORT_TOO_LARGE"];

const historyStatusLabel = (job: ExportJobDto): string => {
  if (job.status === "FAILED" && job.error && KNOWN_EXPORT_ERRORS.includes(job.error)) {
    return t(`analytics.export.errors.${job.error}`);
  }

  return statusMeta.value[job.status].label;
};

const statusMeta = computed<Record<ExportJobDto["status"], { label: string; className: string }>>(() => ({
  PENDING: { label: t("analytics.export.status.pending"), className: "status-pending" },
  PROCESSING: { label: t("analytics.export.status.processing"), className: "status-processing" },
  COMPLETED: { label: t("analytics.export.status.completed"), className: "status-completed" },
  FAILED: { label: t("analytics.export.status.failed"), className: "status-failed" },
}));

const recentJobs = computed(() => jobs.value.slice(0, 5));

const handleCreate = async (format: ExportFormat) => {
  createError.value = false;
  try {
    await createExport(format);
  } catch {
    createError.value = true;
  }
};

const handleClickOutside = (event: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => document.addEventListener("mousedown", handleClickOutside));
onUnmounted(() => document.removeEventListener("mousedown", handleClickOutside));
</script>

<template>
  <div ref="menuRef" class="export-menu">
    <button type="button" class="trigger" @click="isOpen = !isOpen">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
        />
      </svg>
      {{ t("analytics.export.trigger") }}
    </button>

    <div v-if="isOpen" class="dropdown">
      <p class="section-label">{{ t("analytics.export.newExport") }}</p>
      <div class="format-grid">
        <button
          v-for="format in (Object.keys(FORMAT_LABELS) as ExportFormat[])"
          :key="format"
          type="button"
          :disabled="isCreating"
          class="format-btn"
          @click="handleCreate(format)"
        >
          {{ FORMAT_LABELS[format] }}
        </button>
      </div>

      <p v-if="createError" class="error-text">{{ t("analytics.export.createError") }}</p>

      <hr class="divider" />

      <p class="section-label">{{ t("analytics.export.history") }}</p>

      <p v-if="recentJobs.length === 0" class="empty-text">{{ t("analytics.export.noHistory") }}</p>
      <div v-else class="history-list">
        <div v-for="job in recentJobs" :key="job.id" class="history-row">
          <div class="history-info">
            <div v-if="job.status === 'PENDING' || job.status === 'PROCESSING'" class="spinner" />
            <svg
              v-else-if="job.status === 'COMPLETED'"
              aria-hidden="true"
              class="status-icon status-completed"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <svg
              v-else
              aria-hidden="true"
              class="status-icon status-failed"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>

            <div class="history-text">
              <p class="history-format">{{ FORMAT_LABELS[job.format] }}</p>
              <p class="history-status" :class="statusMeta[job.status].className">
                {{ historyStatusLabel(job) }}
              </p>
            </div>
          </div>

          <button
            v-if="job.status === 'COMPLETED'"
            type="button"
            class="download-btn"
            :aria-label="t('analytics.export.download')"
            :title="t('analytics.export.download')"
            @click="downloadExport(job)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-menu {
  position: relative;
}
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  background: white;
  cursor: pointer;
}
.trigger:hover {
  background: #f8fafc;
}
.trigger svg {
  height: 16px;
  width: 16px;
}
.dropdown {
  position: absolute;
  right: 0;
  margin-top: 6px;
  width: 288px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: white;
  padding: 12px;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.1);
  z-index: 30;
}
.section-label {
  padding: 0 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
  margin: 0;
}
.format-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.format-btn {
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 8px 0;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  cursor: pointer;
}
.format-btn:hover:not(:disabled) {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #4f46e5;
}
.format-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.error-text {
  margin-top: 8px;
  font-size: 11px;
  font-weight: 500;
  color: #dc2626;
}
.divider {
  margin: 12px 0;
  border: none;
  border-top: 1px solid #f1f5f9;
}
.empty-text {
  padding: 12px 4px;
  font-size: 12px;
  color: #94a3b8;
}
.history-list {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 8px;
  padding: 6px;
}
.history-row:hover {
  background: #f8fafc;
}
.history-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.spinner {
  height: 14px;
  width: 14px;
  flex-shrink: 0;
  border-radius: 999px;
  border: 2px solid #e2e8f0;
  border-top-color: #6366f1;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.status-icon {
  height: 14px;
  width: 14px;
  flex-shrink: 0;
}
.status-completed {
  color: #059669;
}
.status-failed {
  color: #dc2626;
}
.status-pending {
  color: #94a3b8;
}
.status-processing {
  color: #d97706;
}
.history-text {
  min-width: 0;
}
.history-format {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  margin: 0;
}
.history-status {
  font-size: 10px;
  font-weight: 500;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.download-btn {
  flex-shrink: 0;
  border-radius: 8px;
  padding: 6px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
}
.download-btn:hover {
  background: #eef2ff;
  color: #4f46e5;
}
.download-btn svg {
  height: 16px;
  width: 16px;
}
</style>

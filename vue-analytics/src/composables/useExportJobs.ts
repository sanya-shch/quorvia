import { onUnmounted, ref, shallowRef } from "vue";
import type { ExportFormat, ExportJobDto } from "@quorvia/shared-types";
import { apiGet, apiPost, apiDownload, ApiError } from "../api/client";

const ACTIVE_STATUSES = new Set<ExportJobDto["status"]>(["PENDING", "PROCESSING"]);
const POLL_INTERVAL_MS = 2000;

export const getExportErrorMessage = (e: unknown): string =>
  e instanceof ApiError ? "analytics.errors.exportListLoadFailed" : "analytics.errors.networkError";

export function useExportJobs(apiBaseUrl: string, formId: string) {
  const jobs = shallowRef<ExportJobDto[]>([]);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  const isCreating = ref(false);
  const isDownloading = ref(false);

  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const clearPoll = () => {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const load = async () => {
    try {
      jobs.value = await apiGet<ExportJobDto[]>(apiBaseUrl, `/forms/${formId}/export`);
      error.value = null;
    } catch (e) {
      error.value = getExportErrorMessage(e);
    } finally {
      isLoading.value = false;
    }

    clearPoll();
    if (jobs.value.some((job) => ACTIVE_STATUSES.has(job.status))) {
      pollTimer = setTimeout(load, POLL_INTERVAL_MS);
    }
  };

  const createExport = async (format: ExportFormat) => {
    isCreating.value = true;
    try {
      await apiPost<ExportJobDto>(apiBaseUrl, `/forms/${formId}/export`, { format });
      await load(); // одразу підхоплюємо новий job у список і перезапускаємо polling
    } finally {
      isCreating.value = false;
    }
  };

  const downloadExport = async (job: ExportJobDto) => {
    isDownloading.value = true;
    try {
      const { blob, fileName } = await apiDownload(
        apiBaseUrl,
        `/forms/${formId}/export/${job.id}/download`,
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "export";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      isDownloading.value = false;
    }
  };

  onUnmounted(clearPoll);

  load();

  return {
    jobs,
    isLoading,
    error,
    isCreating,
    isDownloading,
    createExport,
    downloadExport,
    reload: load,
  };
}

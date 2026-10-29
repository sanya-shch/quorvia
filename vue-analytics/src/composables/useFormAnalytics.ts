import { ref, shallowRef } from "vue";
import type { FormAnalyticsDto } from "@quorvia/shared-types";
import { apiGet, ApiError } from "../api/client";

export const getAnalyticsErrorMessage = (e: unknown): string => {
  if (e instanceof ApiError) {
    if (e.status === 403) return "analytics.errors.accessDenied";
    if (e.status === 404) return "analytics.errors.formNotFound";
  }
  return "analytics.errors.loadFailed";
};

export function useFormAnalytics(apiBaseUrl: string, formId: string) {
  const data = shallowRef<FormAnalyticsDto | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);

  const load = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      data.value = await apiGet<FormAnalyticsDto>(apiBaseUrl, `/forms/${formId}/analytics`);
    } catch (e) {
      error.value = getAnalyticsErrorMessage(e);
    } finally {
      isLoading.value = false;
    }
  };

  load();

  return { data, isLoading, error, reload: load };
}

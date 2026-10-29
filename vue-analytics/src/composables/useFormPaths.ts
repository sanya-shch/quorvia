import { ref, shallowRef } from "vue";
import type { FormPathsDto } from "@quorvia/shared-types";
import { apiGet, ApiError } from "../api/client";

export const getPathsErrorMessage = (e: unknown): string =>
  e instanceof ApiError ? "analytics.errors.pathsLoadFailed" : "analytics.errors.networkError";

export function useFormPaths(apiBaseUrl: string, formId: string) {
  const data = shallowRef<FormPathsDto | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);

  const load = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      data.value = await apiGet<FormPathsDto>(apiBaseUrl, `/forms/${formId}/analytics/paths`);
    } catch (e) {
      error.value = getPathsErrorMessage(e);
    } finally {
      isLoading.value = false;
    }
  };

  load();

  return { data, isLoading, error, reload: load };
}

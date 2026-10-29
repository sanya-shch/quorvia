import { ref, shallowRef } from "vue";
import type { FormFunnelDto } from "@quorvia/shared-types";
import { apiGet, ApiError } from "../api/client";

export const getFunnelErrorMessage = (e: unknown): string =>
  e instanceof ApiError ? "analytics.errors.funnelLoadFailed" : "analytics.errors.networkError";

export function useFormFunnel(apiBaseUrl: string, formId: string) {
  const data = shallowRef<FormFunnelDto | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);

  const load = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      data.value = await apiGet<FormFunnelDto>(apiBaseUrl, `/forms/${formId}/analytics/funnel`);
    } catch (e) {
      error.value = getFunnelErrorMessage(e);
    } finally {
      isLoading.value = false;
    }
  };

  load();

  return { data, isLoading, error, reload: load };
}

import { ref, shallowRef } from "vue";
import type { ResponseDetailsDto } from "@quorvia/shared-types";
import { apiGet, ApiError } from "../api/client";

export const getResponseDetailErrorMessage = (e: unknown): string =>
  e instanceof ApiError
    ? "analytics.errors.responseDetailLoadFailed"
    : "analytics.errors.networkError";

export function useResponseDetail(apiBaseUrl: string, formId: string) {
  const data = shallowRef<ResponseDetailsDto | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const load = async (responseId: string) => {
    isLoading.value = true;
    error.value = null;
    data.value = null;
    try {
      data.value = await apiGet<ResponseDetailsDto>(
        apiBaseUrl,
        `/forms/${formId}/responses/${responseId}`,
      );
    } catch (e) {
      error.value = getResponseDetailErrorMessage(e);
    } finally {
      isLoading.value = false;
    }
  };

  return { data, isLoading, error, load };
}

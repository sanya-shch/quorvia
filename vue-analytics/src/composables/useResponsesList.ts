import { ref, shallowRef, watch } from "vue";
import type { ResponseListDto } from "@quorvia/shared-types";
import { apiGet, ApiError } from "../api/client";

const PAGE_SIZE = 10;

export const getResponsesListErrorMessage = (e: unknown): string =>
  e instanceof ApiError
    ? "analytics.errors.responsesListLoadFailed"
    : "analytics.errors.networkError";

export function useResponsesList(apiBaseUrl: string, formId: string) {
  const data = shallowRef<ResponseListDto | null>(null);
  const page = ref(1);
  const isLoading = ref(true);
  const error = ref<string | null>(null);

  const load = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      data.value = await apiGet<ResponseListDto>(
        apiBaseUrl,
        `/forms/${formId}/responses?page=${page.value}&limit=${PAGE_SIZE}`,
      );
    } catch (e) {
      error.value = getResponsesListErrorMessage(e);
    } finally {
      isLoading.value = false;
    }
  };

  watch(page, load);
  load();

  return { data, page, isLoading, error, reload: load };
}

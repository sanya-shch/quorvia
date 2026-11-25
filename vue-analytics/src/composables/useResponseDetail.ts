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

  // Only the answer to the latest load() may land: clicking A and then B quickly must never end
  // with A's late response on screen while B is selected.
  let latest = 0;

  const load = async (responseId: string) => {
    const request = ++latest;
    isLoading.value = true;
    error.value = null;
    // `data` is deliberately kept: the view keeps showing the previous response (and dims it if the
    // wait is noticeable) instead of blanking out to a loader and back, which reads as a flicker.
    try {
      const result = await apiGet<ResponseDetailsDto>(
        apiBaseUrl,
        `/forms/${formId}/responses/${responseId}`,
      );
      if (request === latest) data.value = result;
    } catch (e) {
      if (request === latest) {
        data.value = null;
        error.value = getResponseDetailErrorMessage(e);
      }
    } finally {
      if (request === latest) isLoading.value = false;
    }
  };

  return { data, isLoading, error, load };
}

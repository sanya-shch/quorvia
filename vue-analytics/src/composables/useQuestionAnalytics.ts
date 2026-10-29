import { ref, shallowRef } from "vue";
import type { QuestionAnalyticsDto } from "@quorvia/shared-types";
import { apiGet, ApiError } from "../api/client";

export const getQuestionErrorMessage = (e: unknown): string =>
  e instanceof ApiError
    ? "analytics.errors.questionDetailsLoadFailed"
    : "analytics.errors.networkError";

export function useQuestionAnalytics(apiBaseUrl: string, formId: string) {
  const data = shallowRef<QuestionAnalyticsDto | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const load = async (questionId: string) => {
    isLoading.value = true;
    error.value = null;
    data.value = null;
    try {
      data.value = await apiGet<QuestionAnalyticsDto>(
        apiBaseUrl,
        `/forms/${formId}/questions/${questionId}/analytics`,
      );
    } catch (e) {
      error.value = getQuestionErrorMessage(e);
    } finally {
      isLoading.value = false;
    }
  };

  return { data, isLoading, error, load };
}

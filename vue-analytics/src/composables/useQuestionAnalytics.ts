import { ref, shallowRef, watch, type Ref } from "vue";
import type { QuestionAnalyticsDto } from "@quorvia/shared-types";
import { apiGet, ApiError } from "../api/client";
import { toQuery, type QueryParams } from "../period";

export const getQuestionErrorMessage = (e: unknown): string =>
  e instanceof ApiError
    ? "analytics.errors.questionDetailsLoadFailed"
    : "analytics.errors.networkError";

export function useQuestionAnalytics(
  apiBaseUrl: string,
  formId: string,
  params?: Readonly<Ref<QueryParams>>,
) {
  const data = shallowRef<QuestionAnalyticsDto | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // The open question is reloaded when the period changes, so the panel never shows numbers of
  // a period other than the page's.
  let currentQuestionId: string | null = null;
  let ticket = 0;

  const load = async (questionId: string) => {
    currentQuestionId = questionId;
    const mine = ++ticket;
    isLoading.value = true;
    error.value = null;
    data.value = null;
    try {
      const result = await apiGet<QuestionAnalyticsDto>(
        apiBaseUrl,
        `/forms/${formId}/questions/${questionId}/analytics${toQuery(params?.value)}`,
      );
      if (mine === ticket) data.value = result;
    } catch (e) {
      if (mine === ticket) error.value = getQuestionErrorMessage(e);
    } finally {
      if (mine === ticket) isLoading.value = false;
    }
  };

  if (params) {
    watch(params, () => {
      if (currentQuestionId) load(currentQuestionId);
    });
  }

  return { data, isLoading, error, load };
}

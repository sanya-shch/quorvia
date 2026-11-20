import type { Ref } from "vue";
import type { FormAnalyticsDto } from "@quorvia/shared-types";
import { ApiError } from "../api/client";
import type { QueryParams } from "../period";
import { useQueryResource } from "./useQueryResource";

export const getAnalyticsErrorMessage = (e: unknown): string => {
  if (e instanceof ApiError) {
    if (e.status === 403) return "analytics.errors.accessDenied";
    if (e.status === 404) return "analytics.errors.formNotFound";
  }
  return "analytics.errors.loadFailed";
};

export function useFormAnalytics(
  apiBaseUrl: string,
  formId: string,
  params?: Readonly<Ref<QueryParams>>,
) {
  return useQueryResource<FormAnalyticsDto>(
    apiBaseUrl,
    `/forms/${formId}/analytics`,
    getAnalyticsErrorMessage,
    params,
  );
}

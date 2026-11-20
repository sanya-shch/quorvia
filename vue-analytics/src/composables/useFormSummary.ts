import type { Ref } from "vue";
import type { AnalyticsSummaryDto } from "@quorvia/shared-types";
import { ApiError } from "../api/client";
import type { QueryParams } from "../period";
import { useQueryResource } from "./useQueryResource";

export const getSummaryErrorMessage = (e: unknown): string =>
  e instanceof ApiError ? "analytics.errors.summaryLoadFailed" : "analytics.errors.networkError";

// KPI numbers of the period, the change against the previous one and the per-day series.
export function useFormSummary(
  apiBaseUrl: string,
  formId: string,
  params?: Readonly<Ref<QueryParams>>,
) {
  return useQueryResource<AnalyticsSummaryDto>(
    apiBaseUrl,
    `/forms/${formId}/analytics/summary`,
    getSummaryErrorMessage,
    params,
  );
}

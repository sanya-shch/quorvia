import type { Ref } from "vue";
import type { FormJourneysDto } from "@quorvia/shared-types";
import { ApiError } from "../api/client";
import type { QueryParams } from "../period";
import { useQueryResource } from "./useQueryResource";

export const getJourneysErrorMessage = (e: unknown): string =>
  e instanceof ApiError ? "analytics.errors.journeysLoadFailed" : "analytics.errors.networkError";

// The journey map. `params` holds the period and the map's own filters (status, steps).
export function useFormJourneys(
  apiBaseUrl: string,
  formId: string,
  params: Readonly<Ref<QueryParams>>,
) {
  return useQueryResource<FormJourneysDto>(
    apiBaseUrl,
    `/forms/${formId}/analytics/journeys`,
    getJourneysErrorMessage,
    params,
  );
}

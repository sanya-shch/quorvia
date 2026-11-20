import type { Ref } from "vue";
import type { FormFunnelDto } from "@quorvia/shared-types";
import { ApiError } from "../api/client";
import type { QueryParams } from "../period";
import { useQueryResource } from "./useQueryResource";

export const getFunnelErrorMessage = (e: unknown): string =>
  e instanceof ApiError ? "analytics.errors.funnelLoadFailed" : "analytics.errors.networkError";

export function useFormFunnel(
  apiBaseUrl: string,
  formId: string,
  params?: Readonly<Ref<QueryParams>>,
) {
  return useQueryResource<FormFunnelDto>(
    apiBaseUrl,
    `/forms/${formId}/analytics/funnel`,
    getFunnelErrorMessage,
    params,
  );
}

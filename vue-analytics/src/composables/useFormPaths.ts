import type { Ref } from "vue";
import type { FormPathsDto } from "@quorvia/shared-types";
import { ApiError } from "../api/client";
import type { QueryParams } from "../period";
import { useQueryResource } from "./useQueryResource";

export const getPathsErrorMessage = (e: unknown): string =>
  e instanceof ApiError ? "analytics.errors.pathsLoadFailed" : "analytics.errors.networkError";

export function useFormPaths(
  apiBaseUrl: string,
  formId: string,
  params?: Readonly<Ref<QueryParams>>,
) {
  return useQueryResource<FormPathsDto>(
    apiBaseUrl,
    `/forms/${formId}/analytics/paths`,
    getPathsErrorMessage,
    params,
  );
}

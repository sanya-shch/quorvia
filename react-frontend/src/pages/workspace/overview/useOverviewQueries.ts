import { useQuery } from "@tanstack/react-query";
import { workspaceApi, type PeriodParams } from "../../../api/workspaceApi";

// Each block of the overview loads on its own: one failing widget must not take the page down,
// and the blocks that are ready appear first.
export const useSummary = (formId: string, params: PeriodParams, enabled: boolean) =>
  useQuery({
    queryKey: ["overview", "summary", formId, params],
    queryFn: () => workspaceApi.getSummary(formId, params),
    enabled,
  });

export const useFunnel = (formId: string, params: PeriodParams, enabled: boolean) =>
  useQuery({
    queryKey: ["overview", "funnel", formId, params],
    queryFn: () => workspaceApi.getFunnel(formId, params),
    enabled,
  });

export const useRecentResponses = (formId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["overview", "responses", formId],
    queryFn: () => workspaceApi.getResponses(formId, 1, 5),
    enabled,
  });

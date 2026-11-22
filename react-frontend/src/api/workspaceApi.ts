import type {
  AnalyticsSummaryDto,
  DashboardSummaryDto,
  ExportFormat,
  ExportJobDto,
  FormFunnelDto,
  ResponseListDto,
} from "@quorvia/shared-types";
import { api } from "./axios";

export type PeriodParams = { from?: string; to?: string };

// The reads behind the form overview. All of them are the endpoints the analytics page uses;
// nothing is computed or estimated on the client.
export const workspaceApi = {
  getDashboardSummary: async (params: PeriodParams): Promise<DashboardSummaryDto> =>
    (await api.get("/dashboard/summary", { params })).data,

  getSummary: async (formId: string, params: PeriodParams): Promise<AnalyticsSummaryDto> =>
    (await api.get(`/forms/${formId}/analytics/summary`, { params })).data,

  getFunnel: async (formId: string, params: PeriodParams): Promise<FormFunnelDto> =>
    (await api.get(`/forms/${formId}/analytics/funnel`, { params })).data,

  getResponses: async (formId: string, page: number, limit: number): Promise<ResponseListDto> =>
    (await api.get(`/forms/${formId}/responses`, { params: { page, limit } })).data,

  listExports: async (formId: string): Promise<ExportJobDto[]> =>
    (await api.get(`/forms/${formId}/export`)).data,

  createExport: async (formId: string, format: ExportFormat): Promise<ExportJobDto> =>
    (await api.post(`/forms/${formId}/export`, { format })).data,

  // Saves the finished export through the browser, under the name the server gave it.
  downloadExport: async (formId: string, jobId: string): Promise<void> => {
    const res = await api.get(`/forms/${formId}/export/${jobId}/download`, {
      responseType: "blob",
    });
    const disposition = String(res.headers["content-disposition"] ?? "");
    const fileName = disposition.match(/filename="?([^";]+)"?/)?.[1] ?? "export";
    const url = window.URL.createObjectURL(res.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

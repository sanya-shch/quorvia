import type { FormQuota, FormQuotaInput } from "@quorvia/shared-types";
import { api } from "./axios";

// The react-query key of a form's quotas, shared by whoever reads or invalidates them.
export const quotasQueryKey = (formId: string) => ["quotas", formId] as const;

// The quotas of a form (see the backend module `quota`). They are saved one by one, not with the
// rest of the form: a quota's count is kept by the server and changes with every response.
export const quotasApi = {
  // GET /api/forms/:formId/quotas
  list: async (formId: string): Promise<FormQuota[]> => {
    const response = await api.get<FormQuota[]>(`/forms/${formId}/quotas`);

    return response.data;
  },

  // POST /api/forms/:formId/quotas
  create: async (formId: string, input: FormQuotaInput): Promise<FormQuota> => {
    const response = await api.post<FormQuota>(`/forms/${formId}/quotas`, input);

    return response.data;
  },

  // PATCH /api/forms/:formId/quotas/:quotaId (a different condition makes the server count again)
  update: async (
    formId: string,
    quotaId: string,
    input: Partial<FormQuotaInput>,
  ): Promise<FormQuota> => {
    const response = await api.patch<FormQuota>(`/forms/${formId}/quotas/${quotaId}`, input);

    return response.data;
  },

  // DELETE /api/forms/:formId/quotas/:quotaId
  remove: async (formId: string, quotaId: string): Promise<void> => {
    await api.delete(`/forms/${formId}/quotas/${quotaId}`);
  },

  // POST /api/forms/:formId/quotas/:quotaId/recount
  recount: async (formId: string, quotaId: string): Promise<FormQuota> => {
    const response = await api.post<FormQuota>(`/forms/${formId}/quotas/${quotaId}/recount`);

    return response.data;
  },
};

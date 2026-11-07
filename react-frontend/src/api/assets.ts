import type { AssetDto } from "@quorvia/shared-types";
import { api, API_BASE_URL } from "./axios";

export const assetsApi = {
  // POST /api/forms/:formId/assets (multipart). The browser sets the multipart boundary itself.
  uploadLogo: async (formId: string, file: File): Promise<AssetDto> => {
    const body = new FormData();
    body.append("kind", "LOGO");
    body.append("file", file);

    const response = await api.post<AssetDto>(`/forms/${formId}/assets`, body);
    return response.data;
  },
};

// Public URL of an uploaded image (GET /api/assets/:id needs no authentication).
export const assetUrl = (assetId: string): string => `${API_BASE_URL}/assets/${assetId}`;

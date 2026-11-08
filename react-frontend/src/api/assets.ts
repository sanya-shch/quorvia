import type { AssetDto, AssetKind } from "@quorvia/shared-types";
import { api, API_BASE_URL } from "./axios";

const uploadImage = async (formId: string, kind: AssetKind, file: File): Promise<AssetDto> => {
  const body = new FormData();
  body.append("kind", kind);
  body.append("file", file);

  const response = await api.post<AssetDto>(`/forms/${formId}/assets`, body);
  return response.data;
};

export const assetsApi = {
  // POST /api/forms/:formId/assets (multipart). The browser sets the multipart boundary itself.
  uploadLogo: (formId: string, file: File): Promise<AssetDto> => uploadImage(formId, "LOGO", file),

  // A picture of an IMAGE_CHOICE option.
  uploadOptionImage: (formId: string, file: File): Promise<AssetDto> =>
    uploadImage(formId, "OPTION_IMAGE", file),
};

// Public URL of an uploaded image (GET /api/assets/:id needs no authentication).
export const assetUrl = (assetId: string): string => `${API_BASE_URL}/assets/${assetId}`;

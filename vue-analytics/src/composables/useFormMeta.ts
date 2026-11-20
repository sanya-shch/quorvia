import { shallowRef } from "vue";
import { apiGet } from "../api/client";

// What the page header shows about the form. It is decoration: if the request fails the header
// simply has no title/badge and the page works as before.
export type FormMeta = {
  title?: string;
  isPublished?: boolean;
  version?: number;
  updatedAt?: string;
};

export function useFormMeta(apiBaseUrl: string, formId: string) {
  const data = shallowRef<FormMeta | null>(null);

  apiGet<FormMeta>(apiBaseUrl, `/forms/${formId}/admin`)
    .then((form) => {
      data.value = form;
    })
    .catch(() => {});

  return { data };
}

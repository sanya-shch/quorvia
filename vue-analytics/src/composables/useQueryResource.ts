import { ref, shallowRef, watch, type Ref } from "vue";
import { apiGet } from "../api/client";
import { toQuery, type QueryParams } from "../period";

/**
 * One GET resource of the analytics page that reloads when its query parameters (the period, the
 * journey filters) change. A slow earlier request must not overwrite the answer to a newer one,
 * which is easy to cause by clicking through periods, so every load carries a ticket and only the
 * latest ticket may write the result.
 *
 * Without `params` the URL has no query string: exactly what the page requested before filters.
 */
export function useQueryResource<T>(
  apiBaseUrl: string,
  path: string,
  toErrorMessage: (e: unknown) => string,
  params?: Readonly<Ref<QueryParams>>,
) {
  const data = shallowRef<T | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  let ticket = 0;

  const load = async () => {
    const mine = ++ticket;
    isLoading.value = true;
    error.value = null;

    try {
      const result = await apiGet<T>(apiBaseUrl, `${path}${toQuery(params?.value)}`);
      if (mine === ticket) data.value = result;
    } catch (e) {
      if (mine === ticket) error.value = toErrorMessage(e);
    } finally {
      if (mine === ticket) isLoading.value = false;
    }
  };

  if (params) watch(params, load, { deep: true });
  load();

  return { data, isLoading, error, reload: load };
}

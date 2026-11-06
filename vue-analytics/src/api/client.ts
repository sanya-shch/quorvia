import { AUTH_EXPIRED_EVENT } from "@quorvia/shared-types";

/**
 * Auth bridge with the React host. The access token lives only in the host's memory (not
 * localStorage), so the remote gets it through these functions, which the host passes as props
 * (see AnalyticsApp.vue / VueAnalyticsHost.tsx). The optional refreshAccessToken exchanges the
 * refresh cookie for a new token, so a 401 from an expired access token does not log the user out.
 */
export type AuthBridge = {
  getAccessToken: () => string | null;
  refreshAccessToken?: () => Promise<string | null>;
};

let authBridge: AuthBridge | null = null;

export const setAuthBridge = (bridge: AuthBridge | null) => {
  authBridge = bridge;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const send = (
  apiBaseUrl: string,
  path: string,
  options: RequestInit,
  token: string | null,
): Promise<Response> =>
  fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

const request = async (
  apiBaseUrl: string,
  path: string,
  options: RequestInit = {},
): Promise<Response> => {
  let res = await send(apiBaseUrl, path, options, authBridge?.getAccessToken() ?? null);

  // Expired access token (15 min): ask the host once to exchange the refresh cookie for a new one
  // and repeat the request.
  if (res.status === 401 && authBridge?.refreshAccessToken) {
    const freshToken = await authBridge.refreshAccessToken();

    if (freshToken) {
      res = await send(apiBaseUrl, path, options, freshToken);
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      // The session could not be extended even after a refresh. Vue does NOT decide where to redirect:
      // the single source of truth for logout stays the React host (ProtectedRoute reacts to the Zustand
      // state), so we notify it with a CustomEvent.
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(res.status, `Запит завершився помилкою ${res.status}`);
  }

  return res;
};

export const apiGet = async <T>(apiBaseUrl: string, path: string): Promise<T> => {
  const res = await request(apiBaseUrl, path);
  return res.json() as Promise<T>;
};

export const apiPost = async <T>(apiBaseUrl: string, path: string, body: unknown): Promise<T> => {
  const res = await request(apiBaseUrl, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
};

export const apiDownload = async (
  apiBaseUrl: string,
  path: string,
): Promise<{ blob: Blob; fileName: string | null }> => {
  const res = await request(apiBaseUrl, path);
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition");
  const match = disposition?.match(/filename="?([^"]+)"?/);
  return { blob, fileName: match?.[1] ?? null };
};

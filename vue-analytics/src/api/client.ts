import { AUTH_EXPIRED_EVENT } from "@quorvia/shared-types";

/**
 * Міст автентифікації з React-хостом. Access-токен живе лише в пам'яті
 * хоста (не в localStorage), тому remote отримує його через ці функції,
 * які хост передає пропами (див. AnalyticsApp.vue / VueAnalyticsHost.tsx).
 * refreshAccessToken (необов'язковий) обмінює refresh-cookie на новий
 * токен - так 401 через протухлий access-токен не розлогінює користувача.
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

  // Протухлий access-токен (15 хв): один раз просимо хост обміняти
  // refresh-cookie на новий і повторюємо запит.
  if (res.status === 401 && authBridge?.refreshAccessToken) {
    const freshToken = await authBridge.refreshAccessToken();

    if (freshToken) {
      res = await send(apiBaseUrl, path, options, freshToken);
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      // Сесію не вдалося продовжити навіть після refresh. Vue сам НЕ
      // вирішує, куди редіректити - single source of truth для logout
      // лишається React-хост (ProtectedRoute реагує на Zustand-стан), тож
      // повідомляємо йому CustomEvent-ом.
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

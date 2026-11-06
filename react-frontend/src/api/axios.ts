import axios from "axios";
import { useAuthStore } from "../store/useAuthStore";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:5001/api";

// withCredentials: true is required for the refresh token: it arrives and is sent as an
// httpOnly cookie (not via JS), and the browser attaches/accepts it only if the request is
// explicitly marked as a credentials request.
export const api = axios.create({ baseURL, withCredentials: true });
export const publicApi = axios.create({ baseURL, withCredentials: true });

// automatically add the Bearer token to EVERY request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;

  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/**
 * The access token lives only 15 minutes (backend/src/shared/utils/jwt.ts), so an ordinary
 * 401 no longer means "the session ended": we first try to quietly exchange the refresh cookie
 * for a new access token and repeat the original request EXACTLY once (marked
 * _retriedAfterRefresh so we cannot loop if the new token also gets 401). Only if /auth/refresh
 * itself fails (cookie expired/revoked/missing) do we reset the session.
 *
 * Parallel 401s from several simultaneous requests share ONE refresh request (inFlightRefresh)
 * instead of each triggering its own /auth/refresh; otherwise each would rotate the cookie and
 * "overwrite" the others.
 */
interface RefreshResult {
  accessToken: string;
  user?: { id: string; email: string };
}

let inFlightRefresh: Promise<RefreshResult | null> | null = null;

const requestNewAccessToken = (): Promise<RefreshResult | null> => {
  if (!inFlightRefresh) {
    inFlightRefresh = publicApi
      .post<RefreshResult>("/auth/refresh")
      .then((res) => res.data)
      .catch(() => null)
      .finally(() => {
        inFlightRefresh = null;
      });
  }

  return inFlightRefresh;
};

// Exchanges the refresh cookie for a new access token and puts it (with the user from the same
// response) into the store. Shared by the axios interceptor, session restore and the Vue remote
// (see VueAnalyticsHost.tsx): all share ONE request (inFlightRefresh).
export const refreshAccessToken = async (): Promise<string | null> => {
  const result = await requestNewAccessToken();

  if (!result) return null;

  // The refresh response carries the user, which is what lets ProtectedRoute
  // skip a separate /auth/me request.
  const store = useAuthStore.getState();

  if (result.user) {
    store.setAuth(result.user, result.accessToken);
  } else {
    store.setToken(result.accessToken);
  }

  return result.accessToken;
};

// Called once at app start (ProtectedRoute): the in-memory token is empty after a page reload,
// so we try to restore the session from the httpOnly refresh cookie. Failure = not logged in.
export const restoreSession = async (): Promise<string | null> => {
  const token = await refreshAccessToken();

  if (!token) {
    useAuthStore.getState().clearAuth();
  }

  return token;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as
      | (typeof error.config & { _retriedAfterRefresh?: boolean })
      | undefined;

    const isAuthEndpoint = originalRequest?.url?.startsWith("/auth/");

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retriedAfterRefresh &&
      !isAuthEndpoint
    ) {
      originalRequest._retriedAfterRefresh = true;

      const newToken = await refreshAccessToken();

      if (newToken) {
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      }
    }

    // For vue-analytics requests (the Module Federation remote) the same effect (clearAuth ->
    // ProtectedRoute reacts to isAuthenticated) is reached not directly but through
    // AUTH_EXPIRED_EVENT; see useAuthExpiredListener.ts.
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth();
    }

    return Promise.reject(error);
  },
);

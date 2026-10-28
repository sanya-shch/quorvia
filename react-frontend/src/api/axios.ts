import axios from "axios";
import { useAuthStore } from "../store/useAuthStore";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:5001/api";

// withCredentials: true - обов'язково для refresh-токена: він приходить і
// надсилається як httpOnly cookie (не через JS), браузер докладає/приймає
// її лише якщо запит явно позначено credentials-запитом.
export const api = axios.create({ baseURL, withCredentials: true });
export const publicApi = axios.create({ baseURL, withCredentials: true });

// автоматично додаємо Bearer токен до КОЖНОГО запиту
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;

  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/**
 * Access-токен живе лише 15 хв (backend/src/shared/utils/jwt.ts), тому
 * звичайний 401 більше НЕ означає "сесія скінчилась" - спершу пробуємо
 * непомітно обміняти refresh-cookie на новий access-токен і повторити
 * початковий запит РІВНО один раз (позначаємо _retriedAfterRefresh, щоб
 * не зациклитись, якщо й новий токен теж отримає 401). Лише якщо і сам
 * /auth/refresh не спрацював (cookie протухла/відкликана/відсутня) -
 * скидаємо сесію.
 *
 * Паралельні 401 від кількох одночасних запитів діляться ОДНИМ
 * refresh-запитом (inFlightRefresh), а не тригерять по одному /auth/refresh
 * на кожен - інакше кожен з них ротував би cookie і "перегравав" один
 * одного.
 */
let inFlightRefresh: Promise<string | null> | null = null;

const requestNewAccessToken = (): Promise<string | null> => {
  if (!inFlightRefresh) {
    inFlightRefresh = publicApi
      .post<{ accessToken: string }>("/auth/refresh")
      .then((res) => res.data.accessToken)
      .catch(() => null)
      .finally(() => {
        inFlightRefresh = null;
      });
  }

  return inFlightRefresh;
};

/**
 * Обмінює refresh-cookie на новий access-токен і кладе його в стор.
 * Спільний для axios-інтерцептора, відновлення сесії та Vue-remote
 * (див. VueAnalyticsHost.tsx) - усі діляться ОДНИМ запитом (inFlightRefresh).
 */
export const refreshAccessToken = async (): Promise<string | null> => {
  const newToken = await requestNewAccessToken();

  if (newToken) {
    useAuthStore.getState().setToken(newToken);
  }

  return newToken;
};

/**
 * Викликається один раз при старті застосунку (ProtectedRoute): токен у
 * пам'яті після перезавантаження сторінки порожній, тож пробуємо відновити
 * сесію з httpOnly refresh-cookie. Невдача = користувач не залогінений.
 */
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

    // Для запитів vue-analytics (Module Federation remote) той самий ефект
    // (clearAuth -> ProtectedRoute реагує на isAuthenticated) досягається не
    // напряму, а через AUTH_EXPIRED_EVENT - див. useAuthExpiredListener.ts.
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth();
    }

    return Promise.reject(error);
  },
);

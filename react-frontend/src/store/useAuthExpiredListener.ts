import { useEffect } from "react";
import { AUTH_EXPIRED_EVENT } from "@quorvia/shared-types";
import { useAuthStore } from "./useAuthStore";

/**
 * Слухає AUTH_EXPIRED_EVENT (window CustomEvent, який vue-analytics
 * диспатчить при 401 - vue-analytics/src/api/client.ts) і пропускає його
 * через ТОЙ САМИЙ logout-шлях, що вже використовує axios-інтерцептор для
 * власних 401 React-запитів (api/axios.ts) - clearAuth().
 *
 * Це єдине місце, де React "довіряє" Vue-remote щодо стану автентифікації;
 * сам редірект на /login Vue не ініціює - той продовжує йти реактивно
 * через ProtectedRoute, який стежить за isAuthenticated у цьому ж сторі.
 * Викликається один раз у App.tsx (глобально, не прив'язано до сторінки
 * аналітики) - якщо колись з'являться інші federated remote, той самий
 * слухач обробить і їхній 401 без дублювання коду на кожен remote.
 */
export function useAuthExpiredListener() {
  useEffect(() => {
    const handleAuthExpired = () => {
      useAuthStore.getState().clearAuth();
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, []);
}

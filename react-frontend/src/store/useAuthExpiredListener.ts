import { useEffect } from "react";
import { AUTH_EXPIRED_EVENT } from "@quorvia/shared-types";
import { useAuthStore } from "./useAuthStore";

/**
 * Listens to AUTH_EXPIRED_EVENT (a window CustomEvent that vue-analytics dispatches on 401, see
 * vue-analytics/src/api/client.ts) and runs it through the SAME logout path the axios interceptor
 * already uses for React requests' own 401s (api/axios.ts): clearAuth().
 *
 * This is the only place where React "trusts" the Vue remote about auth state; Vue itself does not
 * trigger the redirect to /login, which keeps happening reactively through ProtectedRoute watching
 * isAuthenticated in this same store. Called once in App.tsx (globally, not tied to the analytics
 * page), so any future federated remote's 401 is handled by the same listener without duplicating
 * code per remote.
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

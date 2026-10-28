import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { authApi } from "../api/auth";
import { useAuthStore } from "../store/useAuthStore";
import { restoreSession } from "../api/axios";

interface ProtectedRouteProps {
  children: React.JSX.Element;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { token, isAuthenticated, isInitialized, setAuth, clearAuth } = useAuthStore();
  const { t } = useTranslation();

  const {
    data: user,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["authMe", token],
    queryFn: async () => {
      try {
        const userData = await authApi.getMe();
        // Навмисно НЕ використовуємо `token` із замикання: якщо access-токен
        // протух, axios-інтерцептор (api/axios.ts) міг непомітно обміняти
        // його на новий ПІД ЧАС цього запиту - беремо актуальне значення
        // напряму зі стору, інакше тут знову збережеться вже недійсний
        // старий токен.
        setAuth(userData, useAuthStore.getState().token!);
        return userData;
      } catch (error) {
        clearAuth();
        throw error;
      }
    },
    enabled: !!token && isAuthenticated,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });

  // Токен лише в пам'яті: після перезавантаження сторінки він порожній, і
  // спершу треба спробувати відновити сесію з refresh-cookie, а вже потім
  // вирішувати, чи редіректити на /login.
  useEffect(() => {
    if (!isInitialized) {
      void restoreSession();
    }
  }, [isInitialized]);

  if (isInitialized && (!token || !isAuthenticated)) {
    return <Navigate to="/login" replace />;
  }

  if (!isInitialized || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          <span className="text-sm font-medium text-slate-500">{t("common.checkingAccess")}</span>
        </div>
      </div>
    );
  }

  if (isError || !user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

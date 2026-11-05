import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/useAuthStore";
import { restoreSession } from "../api/axios";

interface ProtectedRouteProps {
  children: React.JSX.Element;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { token, isAuthenticated, isInitialized } = useAuthStore();
  const { t } = useTranslation();

  // The token lives only in memory, so after a page reload it is empty and the
  // session must be restored from the refresh cookie before deciding on /login.
  // The refresh response already contains the user: no /auth/me request needed.
  useEffect(() => {
    if (!isInitialized) {
      void restoreSession();
    }
  }, [isInitialized]);

  if (isInitialized && (!token || !isAuthenticated)) {
    return <Navigate to="/login" replace />;
  }

  if (!isInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          <span className="text-sm font-medium text-slate-500">{t("common.checkingAccess")}</span>
        </div>
      </div>
    );
  }

  return children;
}

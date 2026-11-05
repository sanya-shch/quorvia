import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/useAuthStore";
import { authApi } from "../../api/auth";
import { formsApi } from "../../api/forms";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import FormCard from "./components/FormCard";

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, clearAuth } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useTranslation();

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ["forms"],
    queryFn: formsApi.getAll,
  });

  const createFormMutation = useMutation({
    mutationFn: formsApi.create,
    onSuccess: (newForm) => {
      navigate(`/builder/${newForm.id}`);
    },
  });

  const deleteFormMutation = useMutation({
    mutationFn: formsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forms"] }),
  });

  const togglePublishMutation = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      isPublished ? formsApi.unpublish(id) : formsApi.publish(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forms"] }),
  });

  const duplicateFormMutation = useMutation({
    mutationFn: formsApi.duplicate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forms"] }),
  });

  const handleLogout = () => {
    // Раніше /auth/logout був no-op, тому клієнт лише чистив локальний
    // стан. Тепер сервер реально відкликає refresh-токен у БД - викликаємо
    // його, але не чекаємо й не блокуємо вихід, якщо запит не вдався
    // (напр. мережа відпала): локальний logout все одно має спрацювати.
    authApi.logout().catch(() => {});
    clearAuth();
    navigate("/login");
  };

  const filteredForms = forms.filter(
    (form) =>
      form.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      form.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const totalResponses = forms.reduce((acc, form) => acc + (form._count?.responses ?? 0), 0);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900 font-sans antialiased">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 font-bold text-xl text-indigo-600 tracking-tight">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z"
              />
            </svg>
            Quorvia
          </div>

          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-700">
                {t("dashboard.header.userLabel")}
              </p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-rose-600 transition-colors cursor-pointer"
              title={t("dashboard.header.logoutTitle")}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{t("dashboard.stats.totalForms")}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">{forms.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{t("dashboard.stats.published")}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-600">
              {forms.filter((f) => f.isPublished).length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              {t("dashboard.stats.totalResponses")}
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-indigo-600">
              {totalResponses}
            </p>
          </div>
        </section>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="relative max-w-md w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.603 10.603Z"
                />
              </svg>
            </span>
            <input
              type="text"
              placeholder={t("dashboard.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-shadow"
            />
          </div>

          <button
            onClick={() => createFormMutation.mutate(t("dashboard.newFormTitle"))}
            disabled={createFormMutation.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-slate-300 shadow-sm transition-colors cursor-pointer"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {createFormMutation.isPending ? t("dashboard.creating") : t("dashboard.createButton")}
          </button>
        </div>

        {filteredForms.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <h3 className="text-sm font-semibold text-slate-900">
              {t("dashboard.emptyState.title")}
            </h3>
            <p className="mt-1 text-sm text-slate-500">{t("dashboard.emptyState.subtitle")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredForms.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                onClick={() => navigate(`/builder/${form.id}`)}
                onDelete={() => deleteFormMutation.mutate(form.id)}
                onDuplicate={() => duplicateFormMutation.mutate(form.id)}
                onTogglePublish={() =>
                  togglePublishMutation.mutate({ id: form.id, isPublished: form.isPublished })
                }
                onAnalytics={() => navigate(`/analytics/${form.id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

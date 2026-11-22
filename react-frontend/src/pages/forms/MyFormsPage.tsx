import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formsApi } from "../../api/forms";
import AppIcon from "../../components/ui/AppIcon";
import AppShell from "../../components/layout/AppShell";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { type FormSummary } from "../../types/form";
import FormsTable from "../dashboard/components/FormsTable";
import SearchField from "../dashboard/SearchField";
import { useFormsActions } from "../dashboard/useFormsActions";
import { BlockError, Skeleton } from "../workspace/overview/Card";

// "My forms": the whole list (the dashboard shows only the latest few).
export default function MyFormsPage() {
  const { t } = useTranslation();
  const actions = useFormsActions();
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState<FormSummary | null>(null);
  const forms = useQuery({ queryKey: ["forms"], queryFn: formsApi.getAll });

  return (
    <AppShell
      topBarStart={<SearchField value={query} onChange={setQuery} />}
      topBarEnd={
        <button
          type="button"
          onClick={() => actions.create.mutate()}
          disabled={actions.create.isPending}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 cursor-pointer"
        >
          <AppIcon name="plus" />
          <span className="hidden sm:inline">{t("dashboard.createButton")}</span>
        </button>
      }
    >
      <div className="mx-auto max-w-[1180px] space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {t("shell.nav.forms")}
          </h1>
          <p className="mt-1 text-slate-500">{t("dashboard.forms.subtitle")}</p>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {forms.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : forms.isError ? (
            <BlockError
              message={t("dashboard.forms.loadFailed")}
              onRetry={() => forms.refetch()}
              retryLabel={t("workspace.overview.retry")}
            />
          ) : (
            <FormsTable
              forms={forms.data ?? []}
              query={query}
              onDelete={setToDelete}
              onTogglePublish={(form) =>
                actions.togglePublish.mutate({ id: form.id, isPublished: form.isPublished })
              }
              onDuplicate={(form) => actions.duplicate.mutate(form.id)}
            />
          )}
        </section>
      </div>
      <ConfirmModal
        isOpen={toDelete !== null}
        title={t("workspace.confirm.deleteTitle")}
        description={t("workspace.confirm.deleteText")}
        confirmLabel={t("workspace.confirm.deleteAction")}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) actions.remove.mutate(toDelete.id);
          setToDelete(null);
        }}
      />
    </AppShell>
  );
}

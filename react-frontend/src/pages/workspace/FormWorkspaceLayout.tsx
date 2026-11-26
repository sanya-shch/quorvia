import { useEffect } from "react";
import { Link, Outlet, useBlocker, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppShell from "../../components/layout/AppShell";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { useFormDraft } from "./useFormDraft";
import { WorkspaceContext } from "./workspaceContext";
import WorkspaceHeader from "./WorkspaceHeader";

// The route element of /forms/:formId/*: loads the form once, owns its editable draft, and
// renders the workspace section (Overview, Builder, Responses, Analytics, Settings) in an <Outlet>.
// The draft lives here, not in a page, so switching sections keeps unsaved edits; leaving the
// workspace asks first.
export default function FormWorkspaceLayout() {
  const { t } = useTranslation();
  const { formId = "" } = useParams();
  const { pathname } = useLocation();
  const draft = useFormDraft(formId);
  const { isDirty } = draft;

  // The Builder is a full-screen editor with its own header; every other section sits in the app
  // shell under the workspace header.
  const isBuilder = pathname.endsWith("/builder");
  // /forms/:formId/<section>/...: the section (overview, analytics, settings...) keys the page
  // transition, so it replays when the section changes but not on in-section navigation
  // (a question inside analytics, a response in the list).
  const section = pathname.split("/")[3] ?? "";

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const blocker = useBlocker(
    ({ nextLocation }) => isDirty && !nextLocation.pathname.startsWith(`/forms/${formId}/`),
  );

  if (draft.isLoading) {
    return (
      <AppShell>
        <div className="space-y-4" role="status" aria-label={t("workspace.loading")}>
          <div className="h-9 w-72 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-4 w-96 animate-pulse rounded bg-slate-200" />
          <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />
        </div>
      </AppShell>
    );
  }

  if (draft.isError || !draft.serverForm) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-900">{t("workspace.loadError.title")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("workspace.loadError.text")}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => draft.refetch()}
              className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-on-solid hover:bg-indigo-500 cursor-pointer"
            >
              {t("workspace.loadError.retry")}
            </button>
            <Link
              to="/forms"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t("workspace.loadError.back")}
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const modals = (
    <>
      <ConfirmModal
        isOpen={draft.isConflict}
        title={t("builder.conflictModal.title")}
        description={t("builder.conflictModal.description")}
        confirmLabel={t("builder.conflictModal.confirm")}
        cancelLabel={t("builder.conflictModal.cancel")}
        onCancel={draft.dismissConflict}
        onConfirm={draft.loadLatestAfterConflict}
      />
      <ConfirmModal
        isOpen={blocker.state === "blocked"}
        title={t("builder.leaveModal.title")}
        description={t("builder.leaveModal.description")}
        confirmLabel={t("builder.leaveModal.confirm")}
        cancelLabel={t("builder.leaveModal.cancel")}
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  );

  return (
    <WorkspaceContext.Provider value={draft}>
      {isBuilder ? (
        <Outlet />
      ) : (
        <AppShell
          topBarStart={
            <nav
              aria-label={t("workspace.breadcrumb.label")}
              className="flex min-w-0 items-center gap-2 text-sm text-slate-500"
            >
              <Link to="/dashboard" className="hover:text-slate-800">
                {t("shell.nav.dashboard")}
              </Link>
              <span aria-hidden="true">/</span>
              <Link to="/forms" className="hover:text-slate-800">
                {t("shell.nav.forms")}
              </Link>
              <span aria-hidden="true">/</span>
              <span className="truncate font-medium text-slate-900">{draft.form.title}</span>
            </nav>
          }
        >
          <div className="mx-auto max-w-[1180px] space-y-6">
            <WorkspaceHeader formId={formId} />
            <div key={section} className="motion-page">
              <Outlet />
            </div>
          </div>
        </AppShell>
      )}
      {modals}
    </WorkspaceContext.Provider>
  );
}

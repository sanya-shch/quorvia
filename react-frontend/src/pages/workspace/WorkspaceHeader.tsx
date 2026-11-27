import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppIcon from "../../components/ui/AppIcon";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { getLanguageName } from "../../i18n/languageNames";
import { getMainLanguage } from "../builder/translations";
import { computeReadiness } from "./readiness";
import { getPublicationStatus, publicFormUrl } from "./formStatus";
import ShareDialog from "./ShareDialog";
import StatusBadge from "./StatusBadge";
import { useFormActions } from "./useFormActions";
import { useWorkspace } from "./workspaceContext";

const TABS = ["overview", "builder", "responses", "analytics", "settings"] as const;

const formatUpdated = (iso: string | undefined, locale: string) =>
  iso
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(iso),
      )
    : null;

// The top of every workspace page except the Builder: title, publication status, the form's
// main actions and the section tabs. Everything shown here is the saved form (or the unsaved
// draft, which the "Unsaved changes" chip announces), never a copy kept for display.
export default function WorkspaceHeader({ formId }: { formId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const draft = useWorkspace();
  const { form, serverForm, saveState, save, isSaving } = draft;
  const actions = useFormActions(formId);

  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "unpublish" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const status = getPublicationStatus({
    isPublished: serverForm?.isPublished,
    responseCount: form.responseCount,
  });
  const isPublished = status === "published";
  const readiness = computeReadiness(form);
  const updated = formatUpdated(serverForm?.updatedAt, i18n.language);
  const shareId = serverForm?.shareId;

  const preview = () => {
    // A published form is previewed as respondents see it; any other is previewed in the editor.
    if (isPublished && shareId) window.open(publicFormUrl(shareId), "_blank", "noopener");
    else navigate(`/forms/${formId}/builder`);
  };

  const menuItem =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium hover:bg-slate-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="max-w-full truncate text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {form.title || t("workspace.header.untitled")}
              </h1>
              <StatusBadge status={status} />
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              {updated && <span>{t("workspace.header.updated", { date: updated })}</span>}
              <span aria-hidden="true">·</span>
              <span>{t("workspace.header.questions", { count: form.questions.length })}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <AppIcon name="globe" className="h-3.5 w-3.5" />
                {getLanguageName(getMainLanguage(form), i18n.language)}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {saveState === "saved" ? (
              <p aria-live="polite" className="flex items-center gap-1.5 text-sm text-slate-500">
                <AppIcon name="checkCircle" className="h-4 w-4 text-emerald-700" />
                {t("builder.allSaved")}
              </p>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 py-1 pl-3 pr-1 text-sm text-amber-800">
                <span aria-live="polite">
                  {saveState === "saving"
                    ? t("builder.saving")
                    : saveState === "error"
                      ? t("workspace.save.failed")
                      : saveState === "conflict"
                        ? t("workspace.save.conflict")
                        : t("builder.unsavedChanges")}
                </span>
                <button
                  type="button"
                  disabled={isSaving || saveState === "conflict"}
                  onClick={() => save()}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-on-solid hover:bg-amber-500 disabled:opacity-50 cursor-pointer"
                >
                  {t("workspace.save.action")}
                </button>
              </div>
            )}

            <Link
              to={`/forms/${formId}/builder`}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-on-solid shadow-sm hover:bg-indigo-500"
            >
              <AppIcon name="edit" />
              {status === "draft"
                ? t("workspace.header.continueEditing")
                : t("workspace.header.edit")}
            </Link>

            {!isPublished && (
              <button
                type="button"
                disabled={!readiness.canPublish || actions.publish.isPending}
                title={readiness.canPublish ? undefined : t("workspace.header.publishBlocked")}
                onClick={() => actions.publish.mutate()}
                className="inline-flex h-10 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {status === "unpublished"
                  ? t("workspace.header.publishAgain")
                  : t("workspace.header.publish")}
              </button>
            )}

            <button
              type="button"
              onClick={preview}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <AppIcon name="eye" />
              {t("workspace.header.preview")}
            </button>

            <button
              type="button"
              disabled={!shareId}
              onClick={() => setShareOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <AppIcon name="share" />
              {t("workspace.header.share")}
            </button>

            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t("workspace.header.moreActions")}
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                <AppIcon name="dots" className="h-5 w-5" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                >
                  {isPublished && (
                    <button
                      role="menuitem"
                      type="button"
                      className={`${menuItem} text-slate-700`}
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirm("unpublish");
                      }}
                    >
                      <AppIcon name="lock" />
                      {t("workspace.header.unpublish")}
                    </button>
                  )}
                  <button
                    role="menuitem"
                    type="button"
                    disabled={actions.duplicate.isPending}
                    className={`${menuItem} text-slate-700`}
                    onClick={() => {
                      setMenuOpen(false);
                      actions.duplicate.mutate();
                    }}
                  >
                    <AppIcon name="copy" />
                    {t("workspace.header.duplicate")}
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    className={`${menuItem} text-rose-700`}
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirm("delete");
                    }}
                  >
                    <AppIcon name="trash" />
                    {t("workspace.header.delete")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <nav
          aria-label={t("workspace.tabs.label")}
          className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1"
        >
          {TABS.map((tab) => (
            <NavLink
              key={tab}
              to={`/forms/${formId}/${tab}`}
              className={({ isActive }) =>
                `-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                  isActive
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`
              }
            >
              {t(`workspace.tabs.${tab}`)}
            </NavLink>
          ))}
        </nav>
      </div>

      {shareOpen && shareId && (
        <ShareDialog
          shareId={shareId}
          isPublished={isPublished}
          mainLanguage={getMainLanguage(form)}
          languages={form.languages ?? []}
          onClose={() => setShareOpen(false)}
        />
      )}

      <ConfirmModal
        isOpen={confirm === "delete"}
        title={t("workspace.confirm.deleteTitle")}
        description={t("workspace.confirm.deleteText")}
        confirmLabel={t("workspace.confirm.deleteAction")}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          actions.remove.mutate();
        }}
      />
      <ConfirmModal
        isOpen={confirm === "unpublish"}
        title={t("workspace.confirm.unpublishTitle")}
        description={t("workspace.confirm.unpublishText")}
        confirmLabel={t("workspace.confirm.unpublishAction")}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          actions.unpublish.mutate();
        }}
      />
    </>
  );
}

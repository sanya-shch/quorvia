import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppIcon from "../../../components/ui/AppIcon";
import { getLanguageName } from "../../../i18n/languageNames";
import type { SaveState } from "../../workspace/useFormDraft";

interface BuilderHeaderProps {
  formId: string;
  title: string;
  onTitleChange: (title: string) => void;
  titleError?: string;
  saveState: SaveState;
  lastSavedAt: Date | null;
  onSave: () => void;
  // Content languages of the form (main first) and the one the preview shows.
  languages: string[];
  previewLanguage: string;
  onPreviewLanguage: (language: string) => void;
  isPublished: boolean;
  canPublish: boolean;
  isPublishing: boolean;
  onPreview: () => void;
  onPublish: () => void;
}

const STATE_STYLE: Record<SaveState, string> = {
  saved: "text-emerald-600",
  saving: "text-slate-500",
  dirty: "text-amber-600",
  error: "text-rose-600",
  conflict: "text-rose-600",
};

// The Builder's own header (it is a full-screen editor, so it does not use the workspace shell).
// Save status is the draft's real state: "saved" only when nothing differs from the server.
export default function BuilderHeader({
  formId,
  title,
  onTitleChange,
  titleError,
  saveState,
  lastSavedAt,
  onSave,
  languages,
  previewLanguage,
  onPreviewLanguage,
  isPublished,
  canPublish,
  isPublishing,
  onPreview,
  onPublish,
}: BuilderHeaderProps) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const time = lastSavedAt
    ? new Intl.DateTimeFormat(i18n.language, { timeStyle: "short" }).format(lastSavedAt)
    : null;
  const statusText =
    saveState === "saved"
      ? time
        ? t("builder.editor.header.savedAt", { time })
        : t("builder.editor.header.saved")
      : t(`builder.editor.header.${saveState}`);
  const needsSave = saveState === "dirty" || saveState === "error";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          to={`/forms/${formId}/overview`}
          className="inline-flex h-9 items-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          aria-label={t("builder.editor.header.back")}
        >
          <AppIcon name="arrowLeft" />
          <span className="hidden sm:inline">{t("builder.editor.header.back")}</span>
        </Link>
        <span aria-hidden="true" className="hidden h-8 w-px bg-slate-200 sm:block" />
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white"
        >
          Q
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {editing ? (
              <input
                ref={inputRef}
                value={title}
                maxLength={200}
                aria-label={t("builder.editor.header.titleLabel")}
                onChange={(e) => onTitleChange(e.target.value)}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setEditing(false)}
                className="h-8 w-56 rounded-lg border border-indigo-300 px-2 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            ) : (
              <>
                <h1 className="max-w-[16rem] truncate text-base font-bold text-slate-900">
                  {title || t("workspace.header.untitled")}
                </h1>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label={t("builder.editor.header.editTitle")}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  <AppIcon name="edit" className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
          <p
            aria-live="polite"
            className={`flex items-center gap-1.5 text-xs font-medium ${STATE_STYLE[saveState]}`}
          >
            <AppIcon
              name={
                saveState === "saved"
                  ? "checkCircle"
                  : saveState === "saving"
                    ? "refresh"
                    : "warning"
              }
              className="h-3.5 w-3.5"
            />
            {statusText}
          </p>
          {titleError && (
            <p role="alert" className="text-xs text-rose-600">
              {titleError}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {needsSave && (
          <button
            type="button"
            onClick={onSave}
            className="h-9 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 cursor-pointer"
          >
            {t("workspace.save.action")}
          </button>
        )}

        {languages.length > 1 && (
          <label className="relative hidden items-center sm:flex">
            <span className="sr-only">{t("builder.editor.header.previewLanguage")}</span>
            <AppIcon
              name="globe"
              className="pointer-events-none absolute left-2.5 h-4 w-4 text-slate-500"
            />
            <select
              value={previewLanguage}
              onChange={(e) => onPreviewLanguage(e.target.value)}
              className="h-9 cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-sm font-semibold text-slate-700"
            >
              {languages.map((code) => (
                <option key={code} value={code}>
                  {getLanguageName(code, i18n.language)}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          onClick={onPreview}
          title={
            isPublished
              ? t("builder.editor.header.previewPublished")
              : t("builder.editor.header.previewRestart")
          }
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <AppIcon name="eye" />
          <span className="hidden sm:inline">{t("workspace.header.preview")}</span>
        </button>

        {isPublished ? (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">
            <AppIcon name="check" />
            {t("workspace.status.published")}
          </span>
        ) : (
          <button
            type="button"
            disabled={!canPublish || saveState !== "saved" || isPublishing}
            onClick={onPublish}
            title={
              !canPublish
                ? t("workspace.header.publishBlocked")
                : saveState !== "saved"
                  ? t("builder.editor.header.saveFirst")
                  : undefined
            }
            className="h-9 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer"
          >
            {t("workspace.header.publish")}
          </button>
        )}
      </div>
    </header>
  );
}

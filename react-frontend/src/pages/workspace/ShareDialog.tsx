import { useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog from "../../components/ui/Dialog";
import AppIcon from "../../components/ui/AppIcon";
import { getLanguageName } from "../../i18n/languageNames";
import { publicFormUrl } from "./formStatus";

interface ShareDialogProps {
  shareId: string;
  isPublished: boolean;
  mainLanguage: string;
  languages: string[];
  onClose: () => void;
}

// The public link of a form, with one link per language for a multilingual form (the public page
// opens in the language given by ?lang=).
export default function ShareDialog({
  shareId,
  isPublished,
  mainLanguage,
  languages,
  onClose,
}: ShareDialogProps) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const all = [mainLanguage, ...languages];

  const copy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      // The clipboard is unavailable (an insecure origin): the link stays selectable in the field.
    }
  };

  const row = (key: string, label: string, url: string) => (
    <div key={key} className="space-y-1.5">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={label}
          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
        />
        <button
          type="button"
          onClick={() => copy(key, url)}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <AppIcon name={copied === key ? "check" : "copy"} />
          {copied === key ? t("workspace.share.copied") : t("workspace.share.copy")}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={t("workspace.share.open")}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <AppIcon name="external" />
        </a>
      </div>
    </div>
  );

  return (
    <Dialog
      title={t("workspace.share.title")}
      description={t("workspace.share.description")}
      onClose={onClose}
      closeLabel={t("common.close")}
    >
      {!isPublished && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          {t("workspace.share.notPublished")}
        </p>
      )}

      <div className="space-y-4">
        {row("main", t("workspace.share.publicLink"), publicFormUrl(shareId))}

        {all.length > 1 && (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-800">
              {t("workspace.share.byLanguage")}
            </p>
            {all.map((language) =>
              row(
                language,
                getLanguageName(language, i18n.language),
                publicFormUrl(shareId, language),
              ),
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

import { useTranslation } from "react-i18next";
import FormLogo from "./FormLogo";

interface QuotaFullScreenProps {
  title: string;
  // The owner's message for the respondent; without one the standard text is shown.
  message?: string | null;
  logoUrl?: string;
}

// Shown instead of the form when the respondent's group is full (a quota): the survey is still open
// for other people, but not for them. Like the closed screen it replaces an error page, in the
// form's language and with the author's branding.
export default function QuotaFullScreen({ title, message, logoUrl }: QuotaFullScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full bg-surface rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
        {logoUrl && (
          <div className="flex justify-center">
            <FormLogo url={logoUrl} />
          </div>
        )}

        <h1 className="text-xl font-bold text-slate-800">{t("viewer.quotaFull.title")}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600">{title}</p>
        <p role="status" className="mt-3 whitespace-pre-line text-sm text-slate-500">
          {message?.trim() ? message : t("viewer.quotaFull.text")}
        </p>
      </div>
    </div>
  );
}

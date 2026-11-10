import { useTranslation } from "react-i18next";
import type { FormClosedReason } from "@quorvia/shared-types";
import FormLogo from "./FormLogo";

interface ClosedScreenProps {
  title: string;
  reason: FormClosedReason;
  logoUrl?: string;
}

// Shown instead of the form once it no longer takes answers: after its closing date, or when it
// has collected the maximum number of responses. It replaces an error page: the respondent learns
// what happened, in the form's language and with the author's branding.
export default function ClosedScreen({ title, reason, logoUrl }: ClosedScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full bg-surface rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
        {logoUrl && (
          <div className="flex justify-center">
            <FormLogo url={logoUrl} />
          </div>
        )}

        <div className="h-12 w-12 bg-amber-50 text-amber-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            aria-hidden="true"
          >
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V8a4 4 0 118 0v3" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-slate-800">{t("viewer.closed.title")}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600">{title}</p>
        <p role="status" className="mt-3 text-sm text-slate-500">
          {t(reason === "DATE" ? "viewer.closed.byDate" : "viewer.closed.byLimit")}
        </p>
      </div>
    </div>
  );
}

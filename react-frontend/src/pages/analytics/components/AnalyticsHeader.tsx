import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface AnalyticsHeaderProps {
  formId: string;
  formTitle?: string;
  currentBreadcrumb?: string;
  // The overview is a wide dashboard; the header lines up with its content column.
  wide?: boolean;
}

export default function AnalyticsHeader({
  formId,
  formTitle,
  currentBreadcrumb,
  wide = false,
}: AnalyticsHeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const resolvedFormTitle = formTitle ?? t("analytics.header.defaultFormTitle");

  return (
    <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm/50">
      <div
        className={`${wide ? "max-w-[1160px] px-5" : "max-w-5xl px-4 sm:px-6 lg:px-8"} mx-auto h-16 flex items-center justify-between`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            aria-label={t("analytics.header.dashboardLink")}
            className="mr-1 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m6-6l-6 6 6 6" />
            </svg>
          </button>

          <button
            onClick={() => navigate("/dashboard")}
            className="text-slate-500 hover:text-slate-600 transition-colors cursor-pointer"
          >
            {t("analytics.header.dashboardLink")}
          </button>

          <svg
            className="h-4 w-4 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>

          <button
            onClick={() => navigate(`/analytics/${formId}`)}
            className={`transition-colors ${currentBreadcrumb ? "text-slate-500 hover:text-slate-600 cursor-pointer" : "text-slate-800"}`}
          >
            {resolvedFormTitle}
          </button>

          {currentBreadcrumb && (
            <>
              <svg
                className="h-4 w-4 text-slate-300"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              <span className="text-slate-800 truncate max-w-[200px] sm:max-w-xs">
                {currentBreadcrumb}
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface AnalyticsHeaderProps {
  formId: string;
  formTitle?: string;
  currentBreadcrumb?: string;
}

export default function AnalyticsHeader({
  formId,
  formTitle,
  currentBreadcrumb,
}: AnalyticsHeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const resolvedFormTitle = formTitle ?? t("analytics.header.defaultFormTitle");

  return (
    <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm/50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
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

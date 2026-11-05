import { useTranslation } from "react-i18next";
import { type FormSummary } from "../../../types/form";
import FormCardMenu from "./FormCardMenu";

interface FormCardProps {
  form: FormSummary;
  onClick: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
  onDuplicate: () => void;
  onAnalytics: () => void;
}

export default function FormCard({
  form,
  onClick,
  onDelete,
  onTogglePublish,
  onDuplicate,
  onAnalytics,
}: FormCardProps) {
  const { t, i18n } = useTranslation();

  const handleCopyLink = () => {
    const publicUrl = `${window.location.origin}/public/forms/${form.shareId}`;
    navigator.clipboard.writeText(publicUrl);
  };

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer"
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span
            className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
              form.isPublished
                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/10"
                : "bg-amber-50 text-amber-700 ring-amber-600/10"
            }`}
          >
            {form.isPublished ? t("dashboard.card.published") : t("dashboard.card.draft")}
          </span>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              {new Date(form.updatedAt).toLocaleDateString(i18n.language)}
            </span>

            <FormCardMenu
              form={form}
              onDelete={onDelete}
              onTogglePublish={onTogglePublish}
              onDuplicate={onDuplicate}
              onCopyLink={handleCopyLink}
              onAnalytics={onAnalytics}
            />
          </div>
        </div>

        <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
          {form.title}
        </h3>
        <p className="mt-1.5 text-sm text-slate-500 line-clamp-2">
          {form.description || t("dashboard.card.noDescription")}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <svg
            className="h-4 w-4 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501c1.153-.086 2.294-.213 3.423-.379 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
            />
          </svg>
          <span>{t("dashboard.card.responsesCount", { count: form._count?.responses ?? 0 })}</span>
        </div>

        <span className="text-slate-500 group-hover:translate-x-1 group-hover:text-indigo-500 transition-transform">
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
              d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

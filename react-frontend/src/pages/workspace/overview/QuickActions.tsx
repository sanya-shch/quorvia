import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppIcon, { type AppIconName } from "../../../components/ui/AppIcon";
import { publicFormUrl } from "../formStatus";
import Card from "./Card";

interface QuickActionsProps {
  formId: string;
  isPublished: boolean;
  shareId?: string;
  onShare: () => void;
  onExport: () => void;
  onDuplicate: () => void;
  isDuplicating: boolean;
}

export default function QuickActions({
  formId,
  isPublished,
  shareId,
  onShare,
  onExport,
  onDuplicate,
  isDuplicating,
}: QuickActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tile =
    "flex h-full min-h-[84px] flex-col items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left text-sm font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 cursor-pointer";
  const icon = (name: AppIconName) => <AppIcon name={name} className="h-5 w-5 text-indigo-600" />;

  return (
    <Card
      title={t("workspace.overview.actions.title")}
      subtitle={t("workspace.overview.actions.subtitle")}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link to={`/forms/${formId}/builder`} className={tile}>
          {icon("edit")}
          {t("workspace.overview.actions.edit")}
        </Link>
        <button
          type="button"
          className={tile}
          onClick={() =>
            // Published: as respondents see it. Otherwise the builder's live preview.
            isPublished && shareId
              ? window.open(publicFormUrl(shareId), "_blank", "noopener")
              : navigate(`/forms/${formId}/builder`)
          }
        >
          {icon("eye")}
          {t("workspace.overview.actions.preview")}
        </button>
        <button type="button" className={tile} disabled={!shareId} onClick={onShare}>
          {icon("share")}
          {t("workspace.overview.actions.share")}
        </button>
        <Link to={`/forms/${formId}/responses`} className={tile}>
          {icon("inbox")}
          {t("workspace.overview.actions.responses")}
        </Link>
        <Link to={`/forms/${formId}/analytics`} className={tile}>
          {icon("bars")}
          {t("workspace.overview.actions.analytics")}
        </Link>
        <button type="button" className={tile} onClick={onExport}>
          {icon("download")}
          {t("workspace.overview.actions.export")}
        </button>
        <button type="button" className={tile} disabled={isDuplicating} onClick={onDuplicate}>
          {icon("copy")}
          {t("workspace.overview.actions.duplicate")}
        </button>
      </div>
    </Card>
  );
}

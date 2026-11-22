import { useTranslation } from "react-i18next";
import type { PublicationStatus } from "./formStatus";

const STYLES: Record<PublicationStatus, string> = {
  published: "bg-emerald-50 text-emerald-700",
  draft: "bg-indigo-50 text-indigo-700",
  unpublished: "bg-slate-100 text-slate-600",
};
const DOTS: Record<PublicationStatus, string> = {
  published: "bg-emerald-500",
  draft: "bg-indigo-500",
  unpublished: "bg-slate-400",
};

export default function StatusBadge({ status }: { status: PublicationStatus }) {
  const { t } = useTranslation();

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOTS[status]}`} />
      {t(`workspace.status.${status}`)}
    </span>
  );
}

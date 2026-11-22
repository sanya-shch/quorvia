import type { ResponseListDto } from "@quorvia/shared-types";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppIcon from "../../../components/ui/AppIcon";
import Card, { BlockError, Skeleton } from "./Card";

interface RecentResponsesProps {
  formId: string;
  data: ResponseListDto | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

// The latest submitted responses. A response has no respondent identity (forms are anonymous),
// so it is listed by id and time; the full answers are one click away in the Responses section.
export default function RecentResponses({
  formId,
  data,
  isLoading,
  isError,
  onRetry,
}: RecentResponsesProps) {
  const { t, i18n } = useTranslation();
  const format = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );

  return (
    <Card
      title={t("workspace.overview.recent.title")}
      subtitle={t("workspace.overview.recent.subtitle")}
      action={
        <Link
          to={`/forms/${formId}/responses`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50"
        >
          <AppIcon name="inbox" />
          {t("workspace.overview.recent.viewAll")}
        </Link>
      }
    >
      {isError ? (
        <BlockError
          message={t("workspace.overview.loadFailed")}
          onRetry={onRetry}
          retryLabel={t("workspace.overview.retry")}
        />
      ) : isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !data || data.data.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          {t("workspace.overview.recent.empty")}
        </p>
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="px-2 py-2 font-semibold">{t("workspace.overview.recent.id")}</th>
                <th className="px-2 py-2 font-semibold">
                  {t("workspace.overview.recent.submitted")}
                </th>
                <th className="px-2 py-2 font-semibold">{t("workspace.overview.recent.status")}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.data.map((response) => (
                <tr key={response.id}>
                  <td className="px-2 py-3 font-mono text-xs font-semibold text-slate-700">
                    #{response.id.slice(0, 8)}
                  </td>
                  <td className="px-2 py-3 text-slate-600">{format(response.createdAt)}</td>
                  <td className="px-2 py-3">
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                      <AppIcon name="checkCircle" className="h-4 w-4" />
                      {t("workspace.overview.recent.completed")}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <Link
                      to={`/forms/${formId}/responses?response=${response.id}`}
                      className="font-semibold text-indigo-600 hover:underline"
                    >
                      {t("workspace.overview.recent.open")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

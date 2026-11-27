import type { FormFunnelDto } from "@quorvia/shared-types";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Card, { BlockError, Skeleton } from "./Card";

interface FunnelSnapshotProps {
  formId: string;
  funnel: FormFunnelDto | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

// A short funnel. "Started" is attempts (autosaved sessions, finished or not) and "Completed"
// the submitted ones; the question list is where attempts actually ended (exitedCount), not the
// difference between two neighbours, so a question hidden by a condition is never blamed.
export default function FunnelSnapshot({
  formId,
  funnel,
  isLoading,
  isError,
  onRetry,
}: FunnelSnapshotProps) {
  const { t } = useTranslation();
  const topExits = (funnel?.nodes ?? [])
    .map((node, index) => ({ node, number: index + 1 }))
    .filter(({ node }) => node.exitedCount > 0)
    .sort((a, b) => b.node.exitedCount - a.node.exitedCount)
    .slice(0, 3);
  const started = funnel?.totalAttempts ?? 0;
  const completed = funnel?.totalCompletions ?? 0;

  return (
    <Card
      title={t("workspace.overview.funnel.title")}
      action={
        <Link to={`/forms/${formId}/analytics`}>
          {t("workspace.overview.funnel.viewAnalytics")}
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
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t("workspace.overview.funnel.started")}</span>
              <span className="font-semibold text-slate-900">{started}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-slate-100">
              <div
                className="motion-grow-x h-2 rounded-full bg-indigo-600"
                style={{ width: started > 0 ? "100%" : "0%" }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t("workspace.overview.funnel.completed")}</span>
              <span className="font-semibold text-slate-900">{completed}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-slate-100">
              <div
                className="motion-grow-x h-2 rounded-full bg-emerald-500"
                style={{ width: started > 0 ? `${(completed / started) * 100}%` : "0%" }}
              />
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{t("workspace.overview.funnel.rate")}</p>
            <p className="text-2xl font-bold text-slate-900">
              {started > 0 ? `${((completed / started) * 100).toFixed(1)}%` : "-"}
            </p>
          </div>

          {topExits.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("workspace.overview.funnel.dropOff")}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {topExits.map(({ node, number }) => (
                  <li
                    key={node.questionId}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate text-slate-700">
                      <b className="mr-1.5 text-indigo-600">Q{number}</b>
                      {node.text || t("workspace.overview.funnel.untitled")}
                    </span>
                    <span className="shrink-0 font-semibold text-rose-700">
                      {t("workspace.overview.funnel.exits", { count: node.exitedCount })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

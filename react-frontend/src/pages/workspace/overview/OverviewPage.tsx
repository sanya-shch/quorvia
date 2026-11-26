import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppIcon from "../../../components/ui/AppIcon";
import { useWorkspace } from "../workspaceContext";
import { getPublicationStatus, publicFormUrl } from "../formStatus";
import { computeReadiness } from "../readiness";
import { useFormActions } from "../useFormActions";
import ShareDialog from "../ShareDialog";
import { getMainLanguage } from "../../builder/translations";
import ActivityChart from "./ActivityChart";
import Card, { BlockError, Skeleton } from "./Card";
import EditDetailsDialog from "./EditDetailsDialog";
import ExportDialog from "./ExportDialog";
import FormInformationCard from "./FormInformationCard";
import FormSetupCard from "./FormSetupCard";
import FunnelSnapshot from "./FunnelSnapshot";
import KpiCards from "./KpiCards";
import QuickActions from "./QuickActions";
import ReadinessCard from "./ReadinessCard";
import RecentResponses from "./RecentResponses";
import { OVERVIEW_PRESETS, resolveOverviewPeriod, type OverviewPreset } from "./period";
import { useFunnel, useRecentResponses, useSummary } from "./useOverviewQueries";

export default function OverviewPage({ formId }: { formId: string }) {
  const { t } = useTranslation();
  const draft = useWorkspace();
  const { form, serverForm, save, isSaving } = draft;
  const actions = useFormActions(formId);

  const [preset, setPreset] = useState<OverviewPreset>("30d");
  const [dialog, setDialog] = useState<"share" | "export" | "details" | null>(null);

  const status = getPublicationStatus({
    isPublished: serverForm?.isPublished,
    responseCount: form.responseCount,
  });
  const isPublished = status === "published";
  // A draft has nothing to measure yet: it gets its configuration and readiness instead of
  // cards full of zeros.
  const showPerformance = status !== "draft";
  const readiness = useMemo(() => computeReadiness(form), [form]);

  const { params, compare } = useMemo(
    () => resolveOverviewPeriod(preset, new Date(), serverForm?.createdAt),
    [preset, serverForm?.createdAt],
  );
  const summary = useSummary(formId, params, showPerformance);
  const funnel = useFunnel(formId, params, showPerformance);
  const recent = useRecentResponses(formId, showPerformance);

  const hasNoActivityEver =
    (form.responseCount ?? 0) === 0 &&
    (summary.data?.current.started ?? 0) === 0 &&
    preset === "all";
  const shareId = serverForm?.shareId;

  return (
    <div className="space-y-6">
      {/* Dialogs sit outside the stagger container: an overlay must not animate as a page block. */}
      <div className="motion-stagger space-y-6">
        {form.questions.length === 0 && (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("workspace.overview.noQuestions.title")}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {t("workspace.overview.noQuestions.text")}
            </p>
            <Link
              to={`/forms/${formId}/builder`}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-on-solid hover:bg-indigo-500"
            >
              <AppIcon name="plus" />
              {t("workspace.overview.noQuestions.action")}
            </Link>
          </section>
        )}

        {!showPerformance && (
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <ReadinessCard formId={formId} readiness={readiness} />
            <FormSetupCard formId={formId} form={form} status={status} />
          </div>
        )}

        {showPerformance && (
          <>
            {isPublished &&
              shareId &&
              (form.responseCount ?? 0) === 0 &&
              (summary.data?.current.started ?? 0) === 0 && (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-6">
                  <h2 className="text-base font-semibold text-emerald-900">
                    {t("workspace.overview.published.title")}
                  </h2>
                  <p className="mt-1 text-sm text-emerald-800">
                    {t("workspace.overview.published.text")}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <code className="max-w-full truncate rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                      {publicFormUrl(shareId)}
                    </code>
                    <button
                      type="button"
                      onClick={() => setDialog("share")}
                      className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-on-solid hover:bg-emerald-500 cursor-pointer"
                    >
                      {t("workspace.overview.actions.share")}
                    </button>
                  </div>
                </section>
              )}

            <KpiCards
              summary={summary.data}
              isLoading={summary.isLoading}
              questionCount={form.questions.length}
              compare={compare}
            />

            {!readiness.canPublish && <ReadinessCard formId={formId} readiness={readiness} />}

            {hasNoActivityEver ? null : (
              <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                <Card
                  title={t("workspace.overview.activity.title")}
                  subtitle={t("workspace.overview.activity.subtitle")}
                  action={
                    <div
                      role="group"
                      aria-label={t("workspace.overview.period.label")}
                      className="inline-flex rounded-xl bg-slate-100 p-1"
                    >
                      {OVERVIEW_PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={preset === p}
                          onClick={() => setPreset(p)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                            preset === p
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {t(`workspace.overview.period.${p}`)}
                        </button>
                      ))}
                    </div>
                  }
                >
                  {summary.isError ? (
                    <BlockError
                      message={t("workspace.overview.loadFailed")}
                      onRetry={() => summary.refetch()}
                      retryLabel={t("workspace.overview.retry")}
                    />
                  ) : summary.isLoading ? (
                    <Skeleton className="h-56 w-full" />
                  ) : (
                    <>
                      <p className="mb-3 text-sm text-slate-500">
                        <span className="mr-1.5 text-2xl font-bold text-slate-900">
                          {summary.data?.current.responses ?? 0}
                        </span>
                        {t("workspace.overview.activity.inPeriod")}
                      </p>
                      <ActivityChart daily={summary.data?.daily ?? []} />
                    </>
                  )}
                </Card>

                <div className="space-y-6">
                  <FormSetupCard formId={formId} form={form} status={status} />
                  <FunnelSnapshot
                    formId={formId}
                    funnel={funnel.data}
                    isLoading={funnel.isLoading}
                    isError={funnel.isError}
                    onRetry={() => funnel.refetch()}
                  />
                </div>
              </div>
            )}

            {!hasNoActivityEver && (
              <RecentResponses
                formId={formId}
                data={recent.data}
                isLoading={recent.isLoading}
                isError={recent.isError}
                onRetry={() => recent.refetch()}
              />
            )}
          </>
        )}

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <QuickActions
            formId={formId}
            isPublished={isPublished}
            shareId={shareId}
            onShare={() => setDialog("share")}
            onExport={() => setDialog("export")}
            onDuplicate={() => actions.duplicate.mutate()}
            isDuplicating={actions.duplicate.isPending}
          />
          <FormInformationCard
            form={form}
            createdAt={serverForm?.createdAt}
            updatedAt={serverForm?.updatedAt}
            onEdit={() => setDialog("details")}
          />
        </div>
      </div>

      {dialog === "share" && shareId && (
        <ShareDialog
          shareId={shareId}
          isPublished={isPublished}
          mainLanguage={getMainLanguage(form)}
          languages={form.languages ?? []}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "export" && <ExportDialog formId={formId} onClose={() => setDialog(null)} />}
      {dialog === "details" && (
        <EditDetailsDialog
          title={form.title}
          description={form.description}
          isSaving={isSaving}
          onClose={() => setDialog(null)}
          onSave={(values) => {
            // Saved right away with the form's one version lock; if validation stops it (the
            // form has other problems), the dialog stays open and the builder's errors are shown there.
            if (save(values)) setDialog(null);
          }}
        />
      )}
    </div>
  );
}

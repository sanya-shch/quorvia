import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formsApi } from "../../api/forms";
import { workspaceApi } from "../../api/workspaceApi";
import AnimatedNumber from "../../components/ui/AnimatedNumber";
import AppIcon, { type AppIconName } from "../../components/ui/AppIcon";
import AppShell from "../../components/layout/AppShell";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { type FormSummary } from "../../types/form";
import ActivityChart from "../workspace/overview/ActivityChart";
import { BlockError, Skeleton } from "../workspace/overview/Card";
import {
  percentChange,
  resolveOverviewPeriod,
  type OverviewPreset,
} from "../workspace/overview/period";
import FormsTable from "./components/FormsTable";
import SearchField from "./SearchField";
import { useFormsActions } from "./useFormsActions";
import { useDemoLimits } from "../../store/useDemoLimits";

const PRESETS: OverviewPreset[] = ["7d", "30d", "90d"];

interface KpiCard {
  key: string;
  icon: AppIconName;
  value: React.ReactNode;
  note: React.ReactNode;
}

const Delta = ({ value, unit }: { value: number | null; unit: "%" | "pts" }) => {
  const { t } = useTranslation();
  if (value === null)
    return <span className="text-slate-400">{t("workspace.overview.kpi.noPrior")}</span>;
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  const tone = rounded > 0 ? "text-emerald-600" : rounded < 0 ? "text-rose-600" : "text-slate-500";
  return (
    <span className={tone}>
      {rounded > 0 ? "+" : rounded < 0 ? "-" : ""}
      {Math.abs(rounded).toFixed(1)}
      {unit === "%" ? "%" : ` ${t("workspace.overview.kpi.points")}`}{" "}
      {t("dashboard.kpi.vsPrevious")}
    </span>
  );
};

// The workspace dashboard: totals over all forms, response activity, and the list of forms. The
// numbers come from one endpoint (/dashboard/summary) that is the per-form analytics summed over
// the user's forms, so they agree with each form's own overview.
export default function Dashboard() {
  const { t } = useTranslation();
  const actions = useFormsActions();
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<OverviewPreset>("30d");
  const [toDelete, setToDelete] = useState<FormSummary | null>(null);

  const forms = useQuery({ queryKey: ["forms"], queryFn: formsApi.getAll });
  const { params } = useMemo(() => resolveOverviewPeriod(preset, new Date()), [preset]);
  const summary = useQuery({
    queryKey: ["dashboard", "summary", params],
    queryFn: () => workspaceApi.getDashboardSummary(params),
  });

  const current = summary.data?.current;
  const previous = summary.data?.previous;
  const list = forms.data ?? [];
  const { maxForms } = useDemoLimits();
  const formLimitReached = list.length >= maxForms;

  const cards: KpiCard[] = [
    {
      key: "forms",
      icon: "layers",
      value: <AnimatedNumber value={summary.data?.forms.total ?? list.length} />,
      note: t("dashboard.kpi.createdInPeriod", { count: summary.data?.forms.createdInPeriod ?? 0 }),
    },
    {
      key: "active",
      icon: "checkCircle",
      value: (
        <AnimatedNumber
          value={summary.data?.forms.published ?? list.filter((f) => f.isPublished).length}
        />
      ),
      note: t("dashboard.kpi.acceptingResponses"),
    },
    {
      key: "responses",
      icon: "inbox",
      value: <AnimatedNumber value={current?.responses ?? 0} />,
      note: previous ? (
        <Delta value={percentChange(current!.responses, previous.responses)} unit="%" />
      ) : (
        t("dashboard.kpi.inPeriod")
      ),
    },
    {
      key: "completion",
      icon: "pulse",
      value:
        current && current.started > 0 ? (
          <AnimatedNumber value={current.completionRate * 100} decimals={1} suffix="%" />
        ) : (
          "-"
        ),
      note:
        previous && current && current.started > 0 && previous.started > 0 ? (
          <Delta value={(current.completionRate - previous.completionRate) * 100} unit="pts" />
        ) : (
          t("dashboard.kpi.ofAttempts")
        ),
    },
  ];

  return (
    <AppShell
      topBarStart={<SearchField value={query} onChange={setQuery} />}
      topBarEnd={
        <button
          type="button"
          onClick={() => actions.create.mutate()}
          disabled={actions.create.isPending || formLimitReached}
          title={formLimitReached ? t("dashboard.demoFormLimit") : undefined}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60 cursor-pointer"
        >
          <AppIcon name="plus" />
          <span className="hidden sm:inline">
            {actions.create.isPending ? t("dashboard.creating") : t("dashboard.createButton")}
          </span>
        </button>
      }
    >
      <div className="motion-stagger mx-auto max-w-[1180px] space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            {t("dashboard.eyebrow")}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            {t("dashboard.title")}
          </h1>
          <p className="mt-1 text-slate-500">{t("dashboard.subtitle")}</p>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {cards.map((card) => (
            <article
              key={card.key}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
            >
              <header className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-slate-500">
                  {t(`dashboard.kpi.${card.key}`)}
                </h2>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <AppIcon name={card.icon} className="h-4 w-4" />
                </span>
              </header>
              {summary.isLoading && card.key !== "forms" && card.key !== "active" ? (
                <Skeleton className="mt-3 h-9 w-24" />
              ) : (
                <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                  {card.value}
                </p>
              )}
              <p className="mt-1 text-xs">{card.note}</p>
            </article>
          ))}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {t("dashboard.activity.title")}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                <span className="mr-1.5 text-2xl font-bold text-slate-900">
                  {current?.responses ?? 0}
                </span>
                {t("dashboard.activity.totalResponses")}
              </p>
            </div>
            <div
              role="group"
              aria-label={t("workspace.overview.period.label")}
              className="inline-flex rounded-xl bg-slate-100 p-1"
            >
              {PRESETS.map((p) => (
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
          </header>
          {summary.isError ? (
            <BlockError
              message={t("workspace.overview.loadFailed")}
              onRetry={() => summary.refetch()}
              retryLabel={t("workspace.overview.retry")}
            />
          ) : summary.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ActivityChart daily={summary.data?.daily ?? []} />
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <header className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">{t("dashboard.forms.title")}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{t("dashboard.forms.subtitle")}</p>
          </header>
          {forms.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : forms.isError ? (
            <BlockError
              message={t("dashboard.forms.loadFailed")}
              onRetry={() => forms.refetch()}
              retryLabel={t("workspace.overview.retry")}
            />
          ) : (
            <FormsTable
              forms={list}
              limit={5}
              query={query}
              onDelete={setToDelete}
              onTogglePublish={(form) =>
                actions.togglePublish.mutate({ id: form.id, isPublished: form.isPublished })
              }
              onDuplicate={(form) => actions.duplicate.mutate(form.id)}
            />
          )}
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t("dashboard.cta.title")}</h2>
            <p className="text-sm text-slate-500">{t("dashboard.cta.text")}</p>
          </div>
          <button
            type="button"
            onClick={() => actions.create.mutate()}
            disabled={actions.create.isPending || formLimitReached}
            title={formLimitReached ? t("dashboard.demoFormLimit") : undefined}
            className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 cursor-pointer"
          >
            {t("dashboard.createButton")}
          </button>
        </section>
      </div>

      <ConfirmModal
        isOpen={toDelete !== null}
        title={t("workspace.confirm.deleteTitle")}
        description={t("workspace.confirm.deleteText")}
        confirmLabel={t("workspace.confirm.deleteAction")}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) actions.remove.mutate(toDelete.id);
          setToDelete(null);
        }}
      />
    </AppShell>
  );
}

import type { AnalyticsSummaryDto } from "@quorvia/shared-types";
import { useTranslation } from "react-i18next";
import AnimatedNumber from "../../../components/ui/AnimatedNumber";
import AppIcon, { type AppIconName } from "../../../components/ui/AppIcon";
import { Skeleton } from "./Card";
import { percentChange } from "./period";

interface KpiCardsProps {
  summary: AnalyticsSummaryDto | undefined;
  isLoading: boolean;
  questionCount: number;
  // Show the change against the previous period (not for "all time").
  compare: boolean;
}

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
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  const tone = rounded > 0 ? "text-emerald-600" : rounded < 0 ? "text-rose-600" : "text-slate-500";

  return (
    <span className={tone}>
      {sign}
      {Math.abs(rounded).toFixed(1)}
      {unit === "%" ? "%" : ` ${t("workspace.overview.kpi.points")}`}{" "}
      {t("workspace.overview.kpi.vsPrior")}
    </span>
  );
};

export default function KpiCards({ summary, isLoading, questionCount, compare }: KpiCardsProps) {
  const { t } = useTranslation();
  const current = summary?.current;
  const previous = compare ? summary?.previous : null;

  const cards: KpiCard[] = [
    {
      key: "attempts",
      icon: "pulse",
      value: <AnimatedNumber value={current?.started ?? 0} />,
      note: previous ? (
        <Delta value={percentChange(current!.started, previous.started)} unit="%" />
      ) : (
        t("workspace.overview.kpi.attemptsHint")
      ),
    },
    {
      key: "responses",
      icon: "checkCircle",
      value: <AnimatedNumber value={current?.responses ?? 0} />,
      note: previous ? (
        <Delta value={percentChange(current!.responses, previous.responses)} unit="%" />
      ) : (
        t("workspace.overview.kpi.responsesHint")
      ),
    },
    {
      key: "completion",
      icon: "trend",
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
          t("workspace.overview.kpi.completionHint")
        ),
    },
    {
      key: "questions",
      icon: "list",
      value: String(questionCount),
      note: t("workspace.overview.kpi.questionsHint"),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <article
          key={card.key}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <header className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-slate-500">
              {t(`workspace.overview.kpi.${card.key}`)}
            </h3>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <AppIcon name={card.icon} className="h-4 w-4" />
            </span>
          </header>
          {isLoading && card.key !== "questions" ? (
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
  );
}

import type { AnalyticsDailyPoint } from "@quorvia/shared-types";
import { useTranslation } from "react-i18next";

const W = 640;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 26, left: 36 };

// A "nice" top of the y axis, so the gridlines read 0 / 5 / 10 and not 0 / 4.3 / 8.6.
const niceMax = (value: number): number => {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= value) ?? pow * 10) * 4;
};

const shortDate = (iso: string) => iso.slice(5).replace("-", "/");

// Responses per day. An empty series (no period, or a period longer than the backend serves a
// day-by-day series for) says so instead of drawing a flat line.
export default function ActivityChart({ daily }: { daily: AnalyticsDailyPoint[] }) {
  const { t } = useTranslation();
  const total = daily.reduce((sum, d) => sum + d.submitted, 0);
  const max = niceMax(Math.max(0, ...daily.map((d) => Math.max(d.started, d.submitted))));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (daily.length <= 1 ? innerW / 2 : (i / (daily.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const line = (key: "started" | "submitted") =>
    daily
      .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`)
      .join(" ");

  if (daily.length < 2) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        {t("workspace.overview.activity.noSeries")}
      </p>
    );
  }

  // A new series (another period) redraws the chart from the start.
  const seriesKey = `${daily[0].date}:${daily.length}`;
  const labels = [...new Set([0, Math.floor((daily.length - 1) / 2), daily.length - 1])];
  const columnWidth = innerW / Math.max(1, daily.length - 1);

  return (
    <figure key={seriesKey} className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={t("workspace.overview.activity.aria", { count: total, days: daily.length })}
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const value = (max / 4) * i;
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(value)}
                y2={y(value)}
                className="stroke-slate-200"
              />
              <text
                x={PAD.left - 6}
                y={y(value) + 3}
                fontSize="10"
                textAnchor="end"
                className="fill-slate-400"
              >
                {Math.round(value * 10) / 10}
              </text>
            </g>
          );
        })}
        <path
          d={`${line("submitted")} L${x(daily.length - 1)},${y(0)} L${x(0)},${y(0)} Z`}
          className="fill-indigo-500 motion-fade"
          opacity="0.1"
        />
        <path
          d={line("started")}
          fill="none"
          className="stroke-indigo-400 motion-draw"
          strokeWidth="2"
          strokeLinejoin="round"
          pathLength={1}
        />
        <path
          d={line("submitted")}
          fill="none"
          className="stroke-indigo-600 motion-draw"
          strokeWidth="2.5"
          strokeLinejoin="round"
          pathLength={1}
        />
        {labels.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            fontSize="10"
            className="fill-slate-400"
            textAnchor={i === 0 ? "start" : i === daily.length - 1 ? "end" : "middle"}
          >
            {shortDate(daily[i].date)}
          </text>
        ))}
        {daily.map((d, i) => (
          <rect
            key={d.date}
            x={x(i) - columnWidth / 2}
            y={PAD.top}
            width={columnWidth}
            height={innerH}
            fill="transparent"
          >
            <title>
              {t("workspace.overview.activity.tooltip", {
                date: d.date,
                started: d.started,
                submitted: d.submitted,
              })}
            </title>
          </rect>
        ))}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs font-medium text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full bg-indigo-600" />
          {t("workspace.overview.activity.submitted")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full bg-indigo-400" />
          {t("workspace.overview.activity.started")}
        </span>
      </figcaption>
    </figure>
  );
}

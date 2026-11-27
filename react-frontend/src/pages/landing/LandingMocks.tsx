import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

// Decorative product previews for the landing page. They are drawn with markup (not screenshots),
// so they follow the interface language and the page theme, and they are hidden from assistive
// technology: the text next to each one says everything it shows.

export function Frame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-indigo-100/50 sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}

const Pill = ({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" }) => (
  <span
    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
      tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
    }`}
  >
    {children}
  </span>
);

const Radio = ({ label, selected = false }: { label: string; selected?: boolean }) => (
  <div
    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
      selected
        ? "border-indigo-500 bg-indigo-50 text-indigo-900"
        : "border-slate-200 text-slate-600"
    }`}
  >
    <span
      className={`h-3 w-3 rounded-full border-2 ${
        selected
          ? "border-indigo-600 bg-indigo-600 ring-2 ring-inset ring-white"
          : "border-slate-300"
      }`}
    />
    {label}
  </div>
);

export function HeroMock() {
  const { t } = useTranslation();

  return (
    <Frame>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">{t("landing.mock.survey")}</p>
        <Pill>{t("landing.mock.builder")}</Pill>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {t("landing.mock.singleChoice")}
          </p>
          <p className="text-xs font-semibold text-slate-800">{t("landing.mock.companySize")}</p>
          <Radio label={t("landing.mock.small")} selected />
          <Radio label={t("landing.mock.medium")} />
          <Radio label={t("landing.mock.large")} />
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              {t("landing.mock.conditionalLogic")}
            </p>
            <Pill tone="green">{t("landing.mock.active")}</Pill>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 text-[11px] font-medium text-slate-600">
            {t("landing.mock.small")}
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-medium">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-indigo-700">
              {t("landing.mock.discoveryRoute")}
            </div>
            <div className="rounded-lg border border-slate-200 p-2 text-slate-600">
              {t("landing.mock.qualificationRoute")}
            </div>
          </div>
          <p className="text-[10px] text-slate-500">{t("landing.mock.matchAll")}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl border-2 border-emerald-500 p-3">
          <p className="text-[10px] font-bold uppercase text-emerald-700">
            {t("landing.mock.qualified")}
          </p>
          <p className="text-2xl font-bold text-slate-900">82</p>
          <p className="text-[10px] text-slate-500">
            {t("landing.mock.score")} {t("landing.mock.outOf")}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] font-bold uppercase text-slate-500">
            {t("landing.mock.notQualified")}
          </p>
          <p className="text-2xl font-bold text-slate-900">34</p>
          <p className="text-[10px] text-slate-500">
            {t("landing.mock.score")} {t("landing.mock.outOf")}
          </p>
        </div>
      </div>
    </Frame>
  );
}

export function StaticFormMock() {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      {(["static1", "static2", "static3"] as const).map((key, i) => (
        <div
          key={key}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500"
        >
          0{i + 1} · {t(`landing.mock.${key}`)}
        </div>
      ))}
    </div>
  );
}

export function RouteMock() {
  const { t } = useTranslation();

  return (
    <div className="space-y-2 text-xs font-medium">
      <div className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-indigo-700">
        {t("landing.mock.answer")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white px-3 py-2 text-slate-700">
          {t("landing.mock.routeA")}
        </div>
        <div className="rounded-lg bg-white px-3 py-2 text-slate-700">
          {t("landing.mock.routeB")}
        </div>
      </div>
    </div>
  );
}

export function OutcomeMock() {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase text-slate-500">
        {t("landing.mock.advancedResult")}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-900">82 {t("landing.mock.outOf")}</p>
      <p className="text-[11px] text-slate-500">{t("landing.mock.personalizedEnd")}</p>
    </div>
  );
}

export function BuilderMock() {
  const { t } = useTranslation();

  return (
    <Frame className="grid gap-3 sm:grid-cols-[1fr_1.6fr_1fr]">
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {t("landing.mock.questions")}
        </p>
        <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
          01 · {t("landing.mock.static1")}
        </div>
        <div className="rounded-lg px-3 py-2 text-xs text-slate-500">
          02 · {t("landing.mock.static2")}
        </div>
        <div className="rounded-lg px-3 py-2 text-xs text-slate-500">
          03 · {t("landing.mock.static3")}
        </div>
        <p className="px-3 text-xs font-semibold text-indigo-600">
          + {t("landing.mock.addQuestion")}
        </p>
      </div>
      <div className="space-y-2 rounded-xl border border-slate-200 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
          {t("landing.mock.singleChoice")}
        </p>
        <p className="text-sm font-semibold text-slate-800">{t("landing.mock.whatHoping")}</p>
        <div className="rounded-lg border-2 border-indigo-500 px-3 py-2 text-xs font-medium">
          {t("landing.mock.qualifyDemand")}
        </div>
        <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
          {t("landing.mock.gatherFeedback")}
        </div>
        <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
          {t("landing.mock.testKnowledge")}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {t("landing.mock.settings")}
        </p>
        <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
          <span className="text-slate-500">{t("landing.mock.required")}</span>
          <span className="font-semibold text-slate-700">{t("landing.mock.enabled")}</span>
        </div>
        <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
          <span className="text-slate-500">{t("landing.mock.logic")}</span>
          <span className="font-semibold text-slate-700">{t("landing.mock.conditions")}</span>
        </div>
      </div>
    </Frame>
  );
}

export function LogicMapMock() {
  const { t } = useTranslation();
  const node = "rounded-xl border bg-white p-3 text-xs";

  return (
    <Frame className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">{t("landing.logicSection.map")}</p>
        <Pill tone="green">{t("landing.logicSection.status")}</Pill>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className={`${node} border-indigo-300 bg-indigo-50 sm:row-span-2`}>
          <p className="text-[10px] font-bold uppercase text-indigo-600">
            {t("landing.mock.start")}
          </p>
          <p className="mt-1 font-semibold text-slate-800">{t("landing.mock.usingProduct")}</p>
          <p className="mt-2 text-[10px] text-slate-500">1,204 {t("landing.mock.reached")}</p>
        </div>
        <div className={`${node} border-indigo-200`}>
          <p className="text-[10px] font-bold uppercase text-indigo-600">
            {t("landing.mock.ifYes")}
          </p>
          <p className="mt-1 font-semibold text-slate-800">{t("landing.mock.satisfaction")}</p>
        </div>
        <div className={`${node} border-slate-200`}>
          <p className="text-[10px] font-bold uppercase text-slate-500">{t("landing.mock.ifNo")}</p>
          <p className="mt-1 font-semibold text-slate-800">{t("landing.mock.discovery")}</p>
        </div>
        <div className={`${node} border-indigo-200 sm:row-span-2`}>
          <p className="text-[10px] font-bold uppercase text-indigo-600">
            {t("landing.mock.resultA")}
          </p>
          <p className="mt-1 font-semibold text-slate-800">{t("landing.mock.thankYou")}</p>
          <p className="mt-4 text-[10px] font-bold uppercase text-slate-500">
            {t("landing.mock.resultB")}
          </p>
          <p className="mt-1 font-semibold text-slate-800">{t("landing.mock.recommendation")}</p>
        </div>
      </div>
    </Frame>
  );
}

export function ScoringMock() {
  const { t } = useTranslation();

  return (
    <Frame>
      <div className="flex items-end justify-between">
        <p className="text-sm font-semibold text-slate-800">{t("landing.mock.readiness")}</p>
        <p className="text-3xl font-bold text-indigo-600">82</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-100">
        <div className="h-2 w-[82%] rounded-full bg-indigo-600" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-medium">
        <div className="rounded-lg border border-slate-200 p-2 text-slate-500">
          0-30
          <br />
          {t("landing.mock.beginner")}
        </div>
        <div className="rounded-lg border border-slate-200 p-2 text-slate-500">
          31-70
          <br />
          {t("landing.mock.intermediate")}
        </div>
        <div className="rounded-lg border-2 border-indigo-500 p-2 text-indigo-700">
          71-100
          <br />
          {t("landing.mock.advancedLevel")}
        </div>
      </div>
    </Frame>
  );
}

export function EndScreensMock() {
  const { t } = useTranslation();

  return (
    <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-white/30 bg-white p-4 text-sm font-semibold text-slate-900">
        {t("landing.mock.greatMatch")}
        <p className="mt-1 text-xs font-medium text-slate-500">
          {t("landing.mock.advancedResult")}
        </p>
      </div>
      <div className="rounded-xl border border-white/30 bg-white p-4 text-sm font-semibold text-slate-900">
        {t("landing.mock.anotherRec")}
        <p className="mt-1 text-xs font-medium text-slate-500">{t("landing.mock.discovery")}</p>
      </div>
    </div>
  );
}

export function AnalyticsMock() {
  const { t } = useTranslation();
  const bars = [100, 96, 85];

  return (
    <Frame>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">{t("landing.mock.survey")}</p>
        <Pill>{t("landing.mock.last30")}</Pill>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ["731", t("landing.mock.started")],
          ["624", t("landing.mock.submitted")],
          ["85.4%", t("landing.mock.completion")],
        ].map(([value, label]) => (
          <div key={label} className="rounded-lg bg-indigo-50 p-2">
            <p className="text-[10px] font-semibold text-slate-500">{label}</p>
            <p className="text-lg font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {t("landing.mock.funnel")}
      </p>
      <div className="mt-2 space-y-2">
        {bars.map((width, i) => (
          <div key={width} className="flex items-center gap-2">
            <span className="w-5 text-[10px] font-semibold text-slate-500">Q{i + 1}</span>
            <div className="h-2 flex-1 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-indigo-600" style={{ width: `${width}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {t("landing.mock.paths")}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg border-2 border-emerald-500 p-2 text-xs font-semibold text-slate-700">
          {t("landing.mock.small")} <span className="text-slate-500">· 389</span>
        </div>
        <div className="rounded-lg border-2 border-emerald-500 p-2 text-xs font-semibold text-slate-700">
          {t("landing.mock.medium")} <span className="text-slate-500">· 275</span>
        </div>
      </div>
    </Frame>
  );
}

export function LanguagesMock() {
  const { t } = useTranslation();

  return (
    <Frame>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">{t("landing.languages.title")}</p>
        <Pill>{t("landing.mock.language")}</Pill>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border-2 border-indigo-500 bg-indigo-50 p-3">
          <p className="text-[10px] font-bold uppercase text-indigo-600">
            English · {t("landing.mock.mainLanguage")}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-800">
            {t("landing.mock.whatHoping")}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] font-bold uppercase text-slate-500">
            Deutsch · {t("landing.mock.translation")}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-800">Was möchten Sie erreichen?</p>
          <p className="mt-1 text-[10px] font-semibold text-emerald-700">
            {t("landing.mock.translationComplete")}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {["English", "Українська", "Deutsch", "Français"].map((name, i) => (
          <span
            key={name}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              i === 0 ? "bg-indigo-600 text-on-solid" : "bg-slate-100 text-slate-600"
            }`}
          >
            {name}
          </span>
        ))}
      </div>
    </Frame>
  );
}

export function ExportsMock() {
  const { t } = useTranslation();

  return (
    <Frame>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">{t("landing.mock.exportData")}</p>
        <span className="rounded-lg bg-indigo-600 px-3 py-1 text-[11px] font-semibold text-on-solid">
          {t("landing.mock.createExport")}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-bold">
        {["PDF", "CSV", "Excel"].map((format) => (
          <div
            key={format}
            className={`rounded-xl border p-4 ${
              format === "CSV"
                ? "border-2 border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-200 text-slate-600"
            }`}
          >
            {format}
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-emerald-50 p-3">
        <p className="text-xs font-semibold text-emerald-800">{t("landing.mock.exportDone")}</p>
        <p className="text-[11px] text-emerald-700">{t("landing.mock.exportDoneText")}</p>
      </div>
    </Frame>
  );
}

export function QuotaMock() {
  const { t } = useTranslation();

  return (
    <div aria-hidden="true" className="rounded-lg bg-slate-50 p-3">
      <div className="flex justify-between text-[11px] font-semibold text-slate-600">
        <span>{t("landing.mock.quota")}</span>
        <span>{t("landing.mock.quotaFilled")}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-200">
        <div className="h-2 w-[76%] rounded-full bg-indigo-600" />
      </div>
    </div>
  );
}

export function AutosaveMock() {
  const { t } = useTranslation();

  return (
    <div aria-hidden="true" className="rounded-lg bg-slate-50 p-3 text-[11px]">
      <p className="font-semibold text-emerald-700">{t("landing.mock.saved")}</p>
      <p className="text-slate-500">{t("landing.mock.savedText")}</p>
    </div>
  );
}

export function ValidationMock() {
  const { t } = useTranslation();

  return (
    <div
      aria-hidden="true"
      className="rounded-lg bg-slate-50 p-3 text-[11px] font-semibold text-emerald-700"
    >
      {t("landing.mock.rules")}
    </div>
  );
}

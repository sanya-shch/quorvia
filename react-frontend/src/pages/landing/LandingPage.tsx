import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MAX_ADDITIONAL_LANGUAGES } from "@quorvia/shared-types";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { useAuthStore } from "../../store/useAuthStore";
import { IS_FOR_PORTFOLIO } from "../../config/portfolio";
import { translateErrorCode } from "../../i18n/errorCodes";
import { useStartDemo } from "./useStartDemo";
import { AVAILABLE_TYPES } from "../builder/editor/questionTypeMeta";
import {
  AnalyticsMock,
  AutosaveMock,
  BuilderMock,
  EndScreensMock,
  ExportsMock,
  HeroMock,
  LanguagesMock,
  LogicMapMock,
  OutcomeMock,
  QuotaMock,
  RouteMock,
  ScoringMock,
  StaticFormMock,
  ValidationMock,
} from "./LandingMocks";

// What the landing page promises: the types a user can pick in this deployment.
const QUESTION_TYPE_COUNT = AVAILABLE_TYPES.length;

const buttonPrimary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";
const buttonSecondary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p
      className={`text-xs font-bold uppercase tracking-[0.18em] ${
        light ? "text-indigo-200" : "text-indigo-600"
      }`}
    >
      {children}
    </p>
  );
}

function Section({
  id,
  tone = "white",
  children,
}: {
  id?: string;
  tone?: "white" | "tinted";
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 border-b border-slate-200 py-16 sm:py-24 ${
        tone === "tinted" ? "bg-slate-50" : "bg-white"
      }`}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text?: string;
}) {
  return (
    <div className="max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-base text-slate-600 sm:text-lg">{text}</p>}
    </div>
  );
}

type Demo = ReturnType<typeof useStartDemo>;

// "Try the demo" (portfolio deployment): replaces the sign-up/log-in links, there are none there.
function DemoButton({
  demo,
  className,
  label,
  withArrow = false,
}: {
  demo: Demo;
  className: string;
  label: string;
  withArrow?: boolean;
}) {
  const { t } = useTranslation();
  const busy = demo.status === "starting" || demo.status === "waking";

  return (
    <button
      type="button"
      onClick={demo.start}
      disabled={busy}
      className={`${className} disabled:opacity-70 cursor-pointer`}
    >
      {busy ? t("landing.demo.starting") : label}
      {!busy && withArrow && <span aria-hidden="true">→</span>}
    </button>
  );
}

// What is happening behind the button: the server is waking up (a free host sleeps when idle) or
// the account could not be created.
function DemoStatus({ demo, light = false }: { demo: Demo; light?: boolean }) {
  const { t } = useTranslation();

  if (demo.status !== "waking" && demo.status !== "failed") return null;

  const text =
    demo.status === "waking"
      ? t("landing.demo.waking")
      : demo.errorCode
        ? translateErrorCode(t, demo.errorCode)
        : t("landing.demo.failed");

  return (
    <p
      role="status"
      className={`mt-4 text-sm font-medium ${
        demo.status === "failed"
          ? light
            ? "text-white"
            : "text-rose-600"
          : light
            ? "text-indigo-100"
            : "text-slate-600"
      }`}
    >
      {text}
    </p>
  );
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-bold text-slate-900">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white"
      >
        Q
      </span>
      Quorvia
    </Link>
  );
}

function Header({ demo }: { demo: Demo }) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        <nav
          aria-label={t("landing.nav.menu")}
          className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex"
        >
          <a href="#features" className="transition-colors hover:text-slate-900">
            {t("landing.nav.features")}
          </a>
          <a href="#use-cases" className="transition-colors hover:text-slate-900">
            {t("landing.nav.useCases")}
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-slate-900">
            {t("landing.nav.howItWorks")}
          </a>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          {isAuthenticated ? (
            <Link to="/dashboard" className={`${buttonPrimary} h-10`}>
              {t("landing.nav.dashboard")}
            </Link>
          ) : IS_FOR_PORTFOLIO ? (
            <DemoButton
              demo={demo}
              className={`${buttonPrimary} h-10`}
              label={t("landing.demo.cta")}
            />
          ) : (
            <>
              <Link
                to="/login"
                className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:text-indigo-600 sm:inline-block"
              >
                {t("landing.nav.logIn")}
              </Link>
              <Link to="/register" className={`${buttonPrimary} h-10`}>
                {t("landing.nav.getStarted")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function FeatureCard({
  title,
  text,
  highlighted = false,
  children,
}: {
  title: string;
  text: string;
  highlighted?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl border p-6 ${
        highlighted ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-white"
      }`}
    >
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 grid gap-2 text-sm font-medium text-slate-700 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-2">
          <svg
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function LandingPage() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const startLink = isAuthenticated ? "/dashboard" : "/register";
  const demo = useStartDemo();
  // In the portfolio deployment the main buttons start a demo instead of linking to registration.
  const startsDemo = IS_FOR_PORTFOLIO && !isAuthenticated;

  const useCases = ["lead", "quiz", "feedback", "recruit"] as const;
  const steps = ["s1", "s2", "s3", "s4"] as const;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Header demo={demo} />

      <main>
        {/* Hero */}
        <section className="border-b border-slate-200 bg-gradient-to-b from-indigo-50/60 to-white py-16 sm:py-24">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <Eyebrow>{t("landing.hero.eyebrow")}</Eyebrow>
              <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                {t("landing.hero.title")}
              </h1>
              <p className="mt-6 max-w-xl text-lg text-slate-600">{t("landing.hero.text")}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                {startsDemo ? (
                  <DemoButton
                    demo={demo}
                    className={buttonPrimary}
                    label={t("landing.demo.cta")}
                    withArrow
                  />
                ) : (
                  <Link to={startLink} className={buttonPrimary}>
                    {t("landing.hero.primary")}
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
                <a href="#features" className={buttonSecondary}>
                  {t("landing.hero.secondary")}
                </a>
              </div>
              {startsDemo && <DemoStatus demo={demo} />}
              <p className="mt-6 text-sm font-medium text-slate-500">
                {startsDemo ? t("landing.demo.note") : t("landing.hero.tagline")}
              </p>
            </div>
            <HeroMock />
          </div>
        </section>

        {/* Problem / value */}
        <Section id="features">
          <SectionHeading
            eyebrow={t("landing.problem.eyebrow")}
            title={t("landing.problem.title")}
            text={t("landing.problem.text")}
          />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <FeatureCard
              title={t("landing.problem.static.title")}
              text={t("landing.problem.static.text")}
            >
              <StaticFormMock />
            </FeatureCard>
            <FeatureCard
              highlighted
              title={t("landing.problem.logic.title")}
              text={t("landing.problem.logic.text")}
            >
              <RouteMock />
            </FeatureCard>
            <FeatureCard
              title={t("landing.problem.outcomes.title")}
              text={t("landing.problem.outcomes.text")}
            >
              <OutcomeMock />
            </FeatureCard>
          </div>
        </Section>

        {/* Builder */}
        <Section tone="tinted">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <SectionHeading
                eyebrow={t("landing.builder.eyebrow")}
                title={t("landing.builder.title")}
                text={t("landing.builder.text", { count: QUESTION_TYPE_COUNT })}
              />
              <CheckList
                items={[
                  t("landing.builder.c1"),
                  t("landing.builder.c2"),
                  t("landing.builder.c3"),
                  t("landing.builder.c4"),
                ]}
              />
            </div>
            <BuilderMock />
          </div>
        </Section>

        {/* Conditional logic */}
        <Section>
          <SectionHeading
            eyebrow={t("landing.logicSection.eyebrow")}
            title={t("landing.logicSection.title")}
            text={t("landing.logicSection.text")}
          />
          <div className="mt-10">
            <LogicMapMock />
            <p className="mt-4 text-sm text-slate-500">{t("landing.logicSection.caption")}</p>
          </div>
        </Section>

        {/* Scoring and end screens */}
        <Section tone="tinted">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
              <Eyebrow>{t("landing.scoring.eyebrow")}</Eyebrow>
              <h2 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                {t("landing.scoring.title")}
              </h2>
              <p className="mt-3 text-slate-600">{t("landing.scoring.text")}</p>
              <div className="mt-6">
                <ScoringMock />
              </div>
            </div>
            <div className="rounded-3xl bg-indigo-600 p-6 text-white sm:p-8">
              <Eyebrow light>{t("landing.scoring.endEyebrow")}</Eyebrow>
              <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
                {t("landing.scoring.endTitle")}
              </h2>
              <p className="mt-3 text-indigo-100">{t("landing.scoring.endText")}</p>
              <div className="mt-6">
                <EndScreensMock />
              </div>
            </div>
          </div>
        </Section>

        {/* Response management */}
        <Section>
          <SectionHeading
            eyebrow={t("landing.control.eyebrow")}
            title={t("landing.control.title")}
            text={t("landing.control.text")}
          />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <FeatureCard
              title={t("landing.control.quotas.title")}
              text={t("landing.control.quotas.text")}
            >
              <QuotaMock />
            </FeatureCard>
            <FeatureCard
              title={t("landing.control.autosave.title")}
              text={t("landing.control.autosave.text")}
            >
              <AutosaveMock />
            </FeatureCard>
            <FeatureCard
              title={t("landing.control.validation.title")}
              text={t("landing.control.validation.text")}
            >
              <ValidationMock />
            </FeatureCard>
          </div>
        </Section>

        {/* Analytics */}
        <Section tone="tinted">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <SectionHeading
                eyebrow={t("landing.analytics.eyebrow")}
                title={t("landing.analytics.title")}
                text={t("landing.analytics.text")}
              />
              <p className="mt-6 font-semibold text-slate-900">{t("landing.analytics.note")}</p>
            </div>
            <AnalyticsMock />
          </div>
        </Section>

        {/* Languages */}
        <Section>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <LanguagesMock />
            <div>
              <SectionHeading
                eyebrow={t("landing.languages.eyebrow")}
                title={t("landing.languages.heading")}
                text={t("landing.languages.text", { count: MAX_ADDITIONAL_LANGUAGES })}
              />
              <CheckList items={[t("landing.languages.c1"), t("landing.languages.c2")]} />
            </div>
          </div>
        </Section>

        {/* Exports: the portfolio deployment runs none, so it does not advertise them. */}
        {!IS_FOR_PORTFOLIO && (
          <Section tone="tinted">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <SectionHeading
                eyebrow={t("landing.exports.eyebrow")}
                title={t("landing.exports.title")}
                text={t("landing.exports.text")}
              />
              <ExportsMock />
            </div>
          </Section>
        )}

        {/* Use cases */}
        <Section id="use-cases">
          <SectionHeading
            eyebrow={t("landing.useCases.eyebrow")}
            title={t("landing.useCases.title")}
            text={t("landing.useCases.text")}
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {useCases.map((key) => (
              <FeatureCard
                key={key}
                title={t(`landing.useCases.${key}.title`)}
                text={t(`landing.useCases.${key}.text`)}
              />
            ))}
          </div>
        </Section>

        {/* How it works */}
        <Section id="how-it-works" tone="tinted">
          <SectionHeading eyebrow={t("landing.how.eyebrow")} title={t("landing.how.title")} />
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((key, index) => (
              <li key={key}>
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white"
                >
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-bold text-slate-900">
                  {t(`landing.how.${key}.title`)}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {t(
                    IS_FOR_PORTFOLIO && key === "s4"
                      ? "landing.demo.analyzeText"
                      : `landing.how.${key}.text`,
                    { count: QUESTION_TYPE_COUNT },
                  )}
                </p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Final call to action */}
        <section className="bg-white px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-5xl rounded-3xl bg-indigo-600 px-6 py-14 text-center text-white sm:px-12">
            <Eyebrow light>{t("landing.cta.eyebrow")}</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">{t("landing.cta.title")}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-indigo-100">{t("landing.cta.text")}</p>
            {startsDemo ? (
              <DemoButton
                demo={demo}
                className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-7 text-sm font-semibold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
                label={t("landing.demo.cta")}
                withArrow
              />
            ) : (
              <Link
                to={startLink}
                className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-7 text-sm font-semibold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
              >
                {t("landing.cta.button")}
                <span aria-hidden="true">→</span>
              </Link>
            )}
            {startsDemo && <DemoStatus demo={demo} light />}
            <p className="mt-6 text-sm text-indigo-200">{t("landing.cta.note")}</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-slate-500">{t("landing.footer.tagline")}</p>
          </div>
          <nav aria-label={t("landing.footer.product")}>
            <h2 className="text-sm font-bold text-slate-900">{t("landing.footer.product")}</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li>{t("landing.footer.formBuilder")}</li>
              <li>{t("landing.footer.conditionalLogic")}</li>
              <li>{t("landing.footer.scoringResults")}</li>
              <li>{t("landing.footer.analytics")}</li>
              <li>{t("landing.footer.multilingual")}</li>
            </ul>
          </nav>
          <nav aria-label={t("landing.footer.explore")}>
            <h2 className="text-sm font-bold text-slate-900">{t("landing.footer.explore")}</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li>
                <a href="#use-cases" className="hover:text-slate-900">
                  {t("landing.footer.useCases")}
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-slate-900">
                  {t("landing.footer.howItWorks")}
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-label={t("landing.footer.account")}>
            <h2 className="text-sm font-bold text-slate-900">{t("landing.footer.account")}</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              {isAuthenticated ? (
                <li>
                  <Link to="/dashboard" className="hover:text-slate-900">
                    {t("landing.nav.dashboard")}
                  </Link>
                </li>
              ) : IS_FOR_PORTFOLIO ? (
                <li>
                  <DemoButton
                    demo={demo}
                    className="hover:text-slate-900"
                    label={t("landing.demo.cta")}
                  />
                </li>
              ) : (
                <>
                  <li>
                    <Link to="/login" className="hover:text-slate-900">
                      {t("landing.footer.logIn")}
                    </Link>
                  </li>
                  <li>
                    <Link to="/register" className="hover:text-slate-900">
                      {t("landing.footer.getStarted")}
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>
        <div className="border-t border-slate-200">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:justify-between sm:px-6">
            <p>{t("landing.footer.rights", { year: new Date().getFullYear() })}</p>
            <p>{t("landing.footer.slogan")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

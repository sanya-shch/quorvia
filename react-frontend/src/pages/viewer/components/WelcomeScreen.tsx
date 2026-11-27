import { useTranslation } from "react-i18next";
import type { FormWelcomeScreen } from "@quorvia/shared-types";
import FormLogo from "./FormLogo";
import { estimateMinutes } from "./welcomeFacts";
import { CheckCircleIcon, ArrowRightIcon, GlobeIcon } from "./viewerIcons";

interface WelcomeScreenProps {
  screen: FormWelcomeScreen;
  logoUrl?: string;
  onStart: () => void;
  // Facts about the form, so the page can say what to expect. All of them are read from the
  // form itself; nothing here is a setting the author has to maintain.
  formTitle?: string;
  questionCount?: number;
  languageName?: string;
  isMultilingual?: boolean;
  responseMode?: "ALL_AT_ONCE" | "STEP_BY_STEP";
  hasBranching?: boolean;
}

const Stat = ({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) => (
  <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
    <span className="mt-0.5 text-indigo-600">{icon}</span>
    <div>
      <p className="text-sm font-bold text-slate-900">{title}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  </div>
);

// Shown before the first question. The form behind it is not rendered yet, so nothing can be
// answered (or autosaved) before the respondent presses the button. Whether this page exists is
// the author's choice (the welcome screen setting); this component only presents it.
export default function WelcomeScreen({
  screen,
  logoUrl,
  onStart,
  formTitle,
  questionCount,
  languageName,
  isMultilingual = false,
  responseMode = "ALL_AT_ONCE",
  hasBranching = false,
}: WelcomeScreenProps) {
  const { t } = useTranslation();
  const hasFacts = questionCount !== undefined && questionCount > 0;

  const notes = [
    responseMode === "STEP_BY_STEP" ? t("viewer.welcome.noteStep") : t("viewer.welcome.noteAll"),
    ...(hasBranching ? [t("viewer.welcome.noteBranching")] : []),
    t("viewer.welcome.noteAutosave"),
  ];

  return (
    <div className="grid w-full items-start gap-8 motion-fade-in lg:grid-cols-[1.15fr_1fr] lg:gap-14">
      <div>
        {logoUrl && (
          <div className="mb-4">
            <FormLogo url={logoUrl} />
          </div>
        )}
        {formTitle && formTitle !== screen.title && (
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
            {formTitle}
          </p>
        )}
        <h1 className="mt-3 text-3xl font-bold leading-tight text-slate-900 sm:text-5xl">
          {screen.title}
        </h1>
        {screen.text && (
          <p className="mt-5 whitespace-pre-line text-base text-slate-500 sm:text-lg">
            {screen.text}
          </p>
        )}

        {hasFacts && (
          <div className="mt-8 grid divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Stat
              icon={<span className="text-lg">≡</span>}
              title={t("viewer.welcome.questions", { count: questionCount })}
              hint={t("viewer.welcome.questionsHint")}
            />
            <Stat
              icon={<span className="text-lg">◔</span>}
              title={t("viewer.welcome.time", { count: estimateMinutes(questionCount) })}
              hint={t("viewer.welcome.timeHint")}
            />
            {languageName && (
              <Stat
                icon={<GlobeIcon className="h-5 w-5" />}
                title={languageName}
                hint={
                  isMultilingual
                    ? t("viewer.welcome.languageSwitch")
                    : t("viewer.welcome.languageHint")
                }
              />
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onStart}
            autoFocus
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 text-base font-semibold text-on-primary shadow-sm transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 cursor-pointer"
          >
            {screen.buttonLabel || t("viewer.welcome.start")}
            <ArrowRightIcon />
          </button>
          <p className="text-sm text-slate-500">{t("viewer.welcome.reviewNote")}</p>
        </div>
        <p className="mt-5 text-sm text-slate-500">{t("viewer.welcome.privacy")}</p>
      </div>

      <aside className="rounded-2xl border border-slate-200 border-t-4 border-t-indigo-600 bg-surface p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold text-slate-900">{t("viewer.welcome.beforeTitle")}</h2>
        <ul className="mt-5 space-y-3">
          {notes.map((note) => (
            <li key={note} className="flex items-start gap-3 text-sm text-slate-700">
              <span className="mt-0.5 text-emerald-700">
                <CheckCircleIcon className="h-5 w-5" />
              </span>
              {note}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

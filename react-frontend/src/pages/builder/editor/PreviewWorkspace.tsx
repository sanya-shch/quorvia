import { useEffect, useMemo, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { localizeForm, localizeQuestion } from "@quorvia/shared-types";
import AppIcon from "../../../components/ui/AppIcon";
import i18n, { createIsolatedI18n, isLocaleLoaded, loadLocale } from "../../../i18n";
import { getUiLanguageFor } from "../../viewer/contentLanguage";
import FormViewer from "../../viewer/FormViewer";
import QuestionStepper, { type StepperView } from "../../viewer/QuestionStepper";
import WelcomeScreen from "../../viewer/components/WelcomeScreen";
import { getLanguageName } from "../../../i18n/languageNames";
import type { FormState } from "../../../types/formBuilder";
import { getMainLanguage } from "../translations";
import TestLogicDialog from "./TestLogicDialog";

export type PreviewDevice = "desktop" | "tablet" | "mobile";
const DEVICE_WIDTH: Record<PreviewDevice, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};
const DEVICES: { value: PreviewDevice; icon: "monitor" | "tablet" | "phone" }[] = [
  { value: "desktop", icon: "monitor" },
  { value: "tablet", icon: "tablet" },
  { value: "mobile", icon: "phone" },
];

interface PreviewWorkspaceProps {
  form: FormState;
  // The question selected in the list: the preview jumps to it (and can then be used freely).
  selectedId: string | null;
  // Content language of the preview (main or one of the translations).
  language: string;
}

const noop = () => {};

// The centre column: the form as a respondent sees it, built from the draft being edited.
//
// It renders the public form's OWN components (FormViewer for "all at once", QuestionStepper for
// "step by step") with no shareId and no session, so: the same rendering, validation and
// branching as the published form (nothing is re-implemented), and nothing is sent anywhere (the
// autosave and file upload need a shareId; a submit is intercepted here). The answers live in
// those components, so "Reset" just remounts them; none of it is form data and none is persisted.
export default function PreviewWorkspace({ form, selectedId, language }: PreviewWorkspaceProps) {
  const { t } = useTranslation();
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [resetKey, setResetKey] = useState(0);
  const [finished, setFinished] = useState(false);
  // The welcome screen (if the author turned it on) comes first, as it does for respondents.
  const [started, setStarted] = useState(false);
  const [logicOpen, setLogicOpen] = useState(false);
  const [view, setView] = useState<StepperView | null>(null);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);

  const main = getMainLanguage(form);
  const isMultilingual = (form.languages?.length ?? 0) > 0;
  const contentLanguage = isMultilingual ? language : main;

  const localized = useMemo(() => {
    if (!isMultilingual || contentLanguage === main) return form;
    return {
      ...localizeForm(form, contentLanguage),
      questions: form.questions.map((q) => localizeQuestion(q, contentLanguage)),
    };
  }, [form, isMultilingual, contentLanguage, main]);

  // Service texts (buttons, errors) in the preview language, in a separate i18n instance, as
  // the public page does; the builder's own interface language is not touched.
  const uiLanguage = getUiLanguageFor(contentLanguage);
  const [loadedUi, setLoadedUi] = useState<string | null>(null);
  const uiReady = !isMultilingual || isLocaleLoaded(uiLanguage) || loadedUi === uiLanguage;
  useEffect(() => {
    if (!isMultilingual) return;
    let cancelled = false;
    void loadLocale(uiLanguage).then(() => !cancelled && setLoadedUi(uiLanguage));
    return () => {
      cancelled = true;
    };
  }, [isMultilingual, uiLanguage]);
  const viewerI18n = useMemo(
    () => (isMultilingual && uiReady ? createIsolatedI18n(uiLanguage) : i18n),
    [isMultilingual, uiReady, uiLanguage],
  );

  const isStep = form.responseMode === "STEP_BY_STEP";
  const total = isStep ? (view?.total ?? 0) : visibleIds.length;
  const position = isStep
    ? view
      ? view.isReview
        ? t("builder.editor.preview.review")
        : t("builder.editor.preview.questionOf", {
            current: view.index + 1,
            total: form.questions.length,
          })
      : ""
    : t("builder.editor.preview.questionsShown", { count: total });
  const selectedHidden =
    Boolean(selectedId) && visibleIds.length > 0 && !visibleIds.includes(selectedId!);

  const reset = () => {
    setFinished(false);
    setStarted(false);
    setResetKey((k) => k + 1);
  };

  const common = {
    formTitle: localized.title,
    formDescription: localized.description,
    questions: localized.questions,
    serverErrors: {},
    onClearServerError: noop,
    embedded: true,
    focusQuestionId: selectedId,
    onSubmit: () => setFinished(true),
  };

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {t("builder.editor.preview.title")}
          </h2>
          <p className="text-xs text-slate-500">{position}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLogicOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <AppIcon name="logic" />
            {t("builder.editor.preview.testLogic")}
          </button>
          <div
            role="group"
            aria-label={t("builder.editor.preview.device")}
            className="flex rounded-xl border border-slate-200 bg-white p-0.5"
          >
            {DEVICES.map(({ value, icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={device === value}
                aria-label={t(`builder.editor.preview.devices.${value}`)}
                title={t(`builder.editor.preview.devices.${value}`)}
                onClick={() => setDevice(value)}
                className={`rounded-lg p-2 cursor-pointer ${
                  device === value
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <AppIcon name={icon} className="h-4 w-4" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={reset}
            aria-label={t("builder.editor.preview.refresh")}
            title={t("builder.editor.preview.refresh")}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <AppIcon name="refresh" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
        <div className="mx-auto w-full" style={{ maxWidth: DEVICE_WIDTH[device] }}>
          <div className="mb-3 flex items-center justify-between text-xs">
            <p className="inline-flex items-center gap-2 text-slate-500">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
              {t("builder.editor.preview.session")}
            </p>
            <button
              type="button"
              onClick={reset}
              className="font-semibold text-indigo-600 hover:underline cursor-pointer"
            >
              {t("builder.editor.preview.reset")}
            </button>
          </div>

          {selectedHidden && (
            <p
              role="status"
              className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
            >
              {t("builder.editor.preview.hiddenByLogic")}
            </p>
          )}

          <div
            className={`overflow-hidden bg-white ${
              device === "desktop"
                ? "rounded-2xl border border-slate-200 shadow-sm"
                : "rounded-[28px] border-4 border-slate-800 shadow-xl"
            }`}
          >
            {localized.welcomeScreen && !started && form.questions.length > 0 ? (
              <div className="p-6 sm:p-8">
                <I18nextProvider i18n={viewerI18n}>
                  <WelcomeScreen
                    screen={localized.welcomeScreen}
                    onStart={() => setStarted(true)}
                    formTitle={localized.title}
                    questionCount={localized.questions.length}
                    languageName={getLanguageName(contentLanguage, contentLanguage)}
                    isMultilingual={isMultilingual}
                    responseMode={form.responseMode}
                    hasBranching={localized.questions.some((q) => Boolean(q.condition))}
                  />
                </I18nextProvider>
              </div>
            ) : form.questions.length === 0 ? (
              <p className="p-12 text-center text-sm text-slate-500">
                {t("builder.editor.preview.empty")}
              </p>
            ) : finished ? (
              <div className="p-12 text-center">
                <p className="text-lg font-bold text-slate-900">
                  {t("builder.editor.preview.finishedTitle")}
                </p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                  {t("builder.editor.preview.finishedText")}
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="mt-5 h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-on-solid hover:bg-indigo-500 cursor-pointer"
                >
                  {t("builder.editor.preview.startAgain")}
                </button>
              </div>
            ) : (
              <I18nextProvider i18n={viewerI18n}>
                {isStep ? (
                  <QuestionStepper key={resetKey} {...common} onViewChange={setView} />
                ) : (
                  <FormViewer key={resetKey} {...common} onViewChange={setVisibleIds} />
                )}
              </I18nextProvider>
            )}
          </div>
        </div>
      </div>

      {logicOpen && (
        <TestLogicDialog
          questions={form.questions}
          selectedId={selectedId}
          onClose={() => setLogicOpen(false)}
        />
      )}
    </section>
  );
}

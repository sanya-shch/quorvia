import { useParams, useSearchParams } from "react-router-dom";
import { I18nextProvider, useTranslation } from "react-i18next";
import { localizeForm, localizeQuestion, pickContentLanguage } from "@quorvia/shared-types";
import i18n, { createIsolatedI18n, isLocaleLoaded, loadLocale } from "../../i18n";
import { type FormAnswers } from "../../types/formViewer";
import { usePublicFormQuery, useSubmitResponsesMutation } from "./hooks/usePublicForm";
import FormViewer from "./FormViewer";
import QuestionStepper from "./QuestionStepper";
import { useEffect, useMemo, useState } from "react";
import { getOrCreateSessionKey } from "./sessionKey";
import { type FieldValidationError } from "./questionValidation";
import { getApiErrorMessage } from "../../i18n/errorCodes";
import ViewerLanguageSwitcher from "./components/ViewerLanguageSwitcher";
import {
  getMainLanguage,
  getRequestedLanguages,
  getUiLanguageFor,
  readBrowserLanguages,
} from "./contentLanguage";

interface ExpectedError {
  response?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

function ThankYou() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm animate-in fade-in zoom-in-95 duration-200">
        <div className="h-12 w-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800">{t("viewer.thankYou.title")}</h2>
        <p className="text-sm text-slate-500 mt-2">{t("viewer.thankYou.subtitle")}</p>
      </div>
    </div>
  );
}

export default function PublicFormPage() {
  const { t } = useTranslation();
  const { shareId } = useParams<{ shareId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: formData, isLoading, error } = usePublicFormQuery(shareId);

  // Мови браузера читаємо один раз: вони не змінюються під час перегляду.
  const [browserLanguages] = useState(readBrowserLanguages);

  const mainLanguage = getMainLanguage(formData?.defaultLanguage);
  const formLanguages = useMemo(
    () => [mainLanguage, ...(formData?.languages ?? [])],
    [mainLanguage, formData?.languages],
  );
  // Усе, що стосується мов, діє лише для багатомовних форм: у одномовної
  // defaultLanguage - це просто значення за замовчуванням (воно могло й не
  // збігатися з реальною мовою тексту), тож чіпати мову інтерфейсу не можна.
  const isMultilingual = formLanguages.length > 1;

  const requestedLang = searchParams.get("lang");
  const language = useMemo(
    () =>
      isMultilingual
        ? pickContentLanguage(
            getRequestedLanguages(requestedLang ? `lang=${requestedLang}` : "", browserLanguages),
            formLanguages,
            mainLanguage,
          )
        : mainLanguage,
    [isMultilingual, requestedLang, browserLanguages, formLanguages, mainLanguage],
  );

  // Форма й питання мовою respondent-а; для основної мови (і одномовних форм)
  // localize* повертають ті самі об'єкти, тож зайвих перерендерів немає.
  const localized = useMemo(() => {
    if (!formData || !isMultilingual) return formData;

    return {
      ...localizeForm(formData, language),
      questions: formData.questions.map((question) => localizeQuestion(question, language)),
    };
  }, [formData, isMultilingual, language]);

  // Службові тексти (кнопки, помилки) - мовою форми, але в ОКРЕМОМУ екземплярі
  // i18n без детектора: вибір респондента не міняє мову застосунку й не
  // пишеться в localStorage.
  const uiLanguage = getUiLanguageFor(language);
  // The UI bundle may differ from the app's language, so it can still be downloading.
  const [loadedUiLanguage, setLoadedUiLanguage] = useState<string | null>(null);
  const uiLocaleReady = !isMultilingual || isLocaleLoaded(uiLanguage) || loadedUiLanguage === uiLanguage;

  useEffect(() => {
    if (!isMultilingual) return;

    let cancelled = false;
    void loadLocale(uiLanguage).then(() => {
      if (!cancelled) setLoadedUiLanguage(uiLanguage);
    });

    return () => {
      cancelled = true;
    };
  }, [isMultilingual, uiLanguage]);

  const viewerI18n = useMemo(
    () => (isMultilingual && uiLocaleReady ? createIsolatedI18n(uiLanguage) : i18n),
    [isMultilingual, uiLocaleReady, uiLanguage],
  );

  const handleLanguageChange = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("lang", next);
        return params;
      },
      { replace: true },
    );
  };

  const [formServerErrors, setFormServerErrors] = useState<Record<string, FieldValidationError>>(
    {},
  );

  // Один sessionKey на shareId, стабільний у межах вкладки (sessionStorage) -
  // об'єднує autosave-чернетку (useAttemptAutosave у FormViewer/
  // QuestionStepper) з фінальним сабмітом, щоб бекенд позначив ту саму
  // спробу completedAt замість того, щоб вона лишилась "покинутою".
  const sessionKey = useMemo(() => (shareId ? getOrCreateSessionKey(shareId) : ""), [shareId]);

  const {
    mutate: submitResponses,
    isSuccess: isSubmitted,
    isPending: isSubmitting,
  } = useSubmitResponsesMutation();

  const handleClearServerError = (fieldId: string) => {
    setFormServerErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const copy = { ...prev };
      delete copy[fieldId];
      return copy;
    });
  };

  const handleFormSubmit = (cleanedAnswers: FormAnswers) => {
    setFormServerErrors({});

    if (shareId)
      submitResponses(
        {
          shareId,
          answers: cleanedAnswers,
          sessionKey,
          language: isMultilingual ? language : undefined,
        },
        {
          onError: (error: unknown) => {
            const err = error as ExpectedError;

            const errorResponseBody = err.response?.data || err.data;

            if (errorResponseBody && Array.isArray(errorResponseBody.errors)) {
              const mappedErrors: Record<string, FieldValidationError> = {};

              errorResponseBody.errors.forEach((err: { field: string; message: string }) => {
                if (!mappedErrors[err.field]) {
                  mappedErrors[err.field] = { key: `errors.${err.message}` };
                }
              });

              setFormServerErrors(mappedErrors);

              const firstErrorField = errorResponseBody.errors[0]?.field;
              if (firstErrorField) {
                setTimeout(() => {
                  document.getElementById(`card-${firstErrorField}`)?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                }, 60);
              }
            }
          },
        },
      );
  };

  if (isLoading || !uiLocaleReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          <p className="text-sm font-semibold text-slate-500">{t("viewer.loading")}</p>
        </div>
      </div>
    );
  }

  if (error || !formData || !localized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 text-center shadow-sm">
          <div className="h-12 w-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-800">{t("viewer.accessError.title")}</h3>
          <p className="text-sm text-slate-500 mt-1">{getApiErrorMessage(t, error)}</p>
        </div>
      </div>
    );
  }

  const content = isSubmitted ? (
    <ThankYou />
  ) : (
    <>
      {isMultilingual && (
        <div className="bg-slate-50 px-4 pt-3">
          <div className="mx-auto max-w-3xl">
            <ViewerLanguageSwitcher
              languages={formLanguages}
              value={language}
              onChange={handleLanguageChange}
            />
          </div>
        </div>
      )}

      <div className={isSubmitting ? "opacity-60 pointer-events-none transition-opacity" : ""}>
        {localized.responseMode === "STEP_BY_STEP" ? (
          <QuestionStepper
            formTitle={localized.title}
            formDescription={localized.description}
            questions={localized.questions}
            serverErrors={formServerErrors}
            onClearServerError={handleClearServerError}
            onSubmit={handleFormSubmit}
            shareId={shareId}
            sessionKey={sessionKey}
          />
        ) : (
          <FormViewer
            formTitle={localized.title}
            formDescription={localized.description}
            questions={localized.questions}
            serverErrors={formServerErrors}
            onClearServerError={handleClearServerError}
            onSubmit={handleFormSubmit}
            shareId={shareId}
            sessionKey={sessionKey}
          />
        )}
      </div>
    </>
  );

  return (
    <I18nextProvider i18n={viewerI18n}>
      {isMultilingual ? <div lang={language}>{content}</div> : content}
    </I18nextProvider>
  );
}

import { otherAnswerKey } from "@quorvia/shared-types";
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { type Question } from "../../types/formBuilder";
import { type FormAnswers } from "../../types/formViewer";
import { resolveVisibleQuestionIds, type QuestionLike } from "@quorvia/condition-engine";
import QuestionField from "./components/QuestionField";
import {
  getDefaultAnswer,
  validateField,
  validateAll,
  buildCleanedAnswers,
  type FieldValidationError,
} from "./questionValidation";
import { useAttemptAutosave } from "./hooks/useAttemptAutosave";
import FormLogo from "./components/FormLogo";
import ViewerShell from "./components/ViewerShell";
import ViewerQuestionCard from "./components/ViewerQuestionCard";
import ReviewScreen from "./components/ReviewScreen";
import SaveIndicator from "./components/SaveIndicator";
import { ArrowRightIcon } from "./components/viewerIcons";
import { countMissingRequired, getAnswerProgress } from "./answerProgress";
import { buildReviewItems } from "./reviewItems";
import { useUploadedFiles } from "./uploadedFilesContext";
import { isHiddenCalculation, useCalculatedValues, withCalculatedValues } from "./calculations";

interface FormViewerProps {
  formTitle: string;
  // Public URL of the form logo, shown above the title.
  logoUrl?: string;
  formDescription?: string;
  questions: Question[];
  onSubmit: (data: FormAnswers) => void;
  serverErrors?: Record<string, FieldValidationError>;
  onClearServerError?: (fieldId: string) => void;
  shareId?: string;
  sessionKey?: string;
  // The language switcher and a banner (the quota warning), placed by the page.
  languageSwitcher?: ReactNode;
  notice?: ReactNode;
}

export default function FormViewer({
  formTitle,
  logoUrl,
  formDescription,
  questions: allQuestions,
  onSubmit,
  serverErrors = {},
  onClearServerError,
  shareId,
  sessionKey = "",
  languageSwitcher,
  notice,
}: FormViewerProps) {
  const { t, i18n } = useTranslation();
  const uploadedFiles = useUploadedFiles();
  // "form": every question on one page; "review": the answers as text, opened by "Review answers".
  const [view, setView] = useState<"form" | "review">("form");
  // The question to scroll to when the form is shown again ("Edit" on the review screen).
  const scrollTargetRef = useRef<string | null>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  // A calculation hidden from the respondent is never shown (the server does not even send it).
  const questions = useMemo(
    () => allQuestions.filter((q) => !isHiddenCalculation(q)),
    [allQuestions],
  );
  const [answers, setAnswers] = useState<FormAnswers>(() => {
    const initialAnswers: FormAnswers = {};
    questions.forEach((q, index) => {
      // A calculation has no answer of its own: its value is computed.
      if (q.type === "CALCULATION") return;
      const qId = q.id || `q-${index}`;
      initialAnswers[qId] = getDefaultAnswer(q);
    });
    return initialAnswers;
  });

  const { status: saveStatus } = useAttemptAutosave(shareId, sessionKey, answers);

  const [isSubmitAttempted, setIsSubmitAttempted] = useState(false);
  const [localErrors, setLocalErrors] = useState<Record<string, FieldValidationError>>({});
  const combinedErrors = { ...serverErrors, ...localErrors };

  const visibleQuestionIds = useMemo(
    () => resolveVisibleQuestionIds(questions as unknown as QuestionLike[], answers),
    [questions, answers],
  );
  const visibleQuestions = useMemo(
    () => questions.filter((q) => !q.id || visibleQuestionIds.has(q.id)),
    [questions, visibleQuestionIds],
  );

  // What the calculation fields show for the answers so far.
  const calculated = useCalculatedValues(questions, answers, visibleQuestionIds);
  const shownAnswers = useMemo(
    () => withCalculatedValues(answers, calculated),
    [answers, calculated],
  );

  const progress = useMemo(
    () => getAnswerProgress(visibleQuestions, shownAnswers),
    [visibleQuestions, shownAnswers],
  );
  const missingRequired = useMemo(
    () => countMissingRequired(validateAll(visibleQuestions, answers)),
    [visibleQuestions, answers],
  );

  // Back on the form after "Edit": bring the chosen question into view and move focus to it.
  useEffect(() => {
    if (view !== "form" || !scrollTargetRef.current) return;

    const card = document.getElementById(`card-${scrollTargetRef.current}`);
    scrollTargetRef.current = null;
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    card?.querySelector<HTMLElement>("input, textarea, select, button")?.focus({
      preventScroll: true,
    });
  }, [view]);

  // A new screen starts at the top, with the heading focused for assistive technology.
  useEffect(() => {
    if (view !== "review") return;

    window.scrollTo({ top: 0 });
    reviewHeadingRef.current?.focus();
  }, [view]);

  const handleAnswerChange = (questionId: string, value: FormAnswers[string]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

    if (serverErrors[questionId] && onClearServerError) {
      onClearServerError(questionId);
    }

    if (isSubmitAttempted) {
      const question = questions.find((q) => (q.id || "") === questionId);
      if (question) {
        const error = validateField(question, value, answers[otherAnswerKey(questionId)]);
        setLocalErrors((prev) => {
          const copy = { ...prev };
          if (error) {
            copy[questionId] = error;
          } else {
            delete copy[questionId];
          }
          return copy;
        });
      }
    } else if (localErrors[questionId]) {
      setLocalErrors((prev) => {
        const copy = { ...prev };
        delete copy[questionId];
        return copy;
      });
    }
  };

  const handleOtherChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [otherAnswerKey(questionId)]: text }));

    if (serverErrors[questionId] && onClearServerError) {
      onClearServerError(questionId);
    }

    const question = questions.find((q) => (q.id || "") === questionId);

    if (isSubmitAttempted && question) {
      const error = validateField(question, answers[questionId], text);
      setLocalErrors((prev) => {
        const copy = { ...prev };
        if (error) copy[questionId] = error;
        else delete copy[questionId];
        return copy;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors = validateAll(visibleQuestions, answers);
    setLocalErrors(newErrors);

    const isValid = Object.keys(newErrors).length === 0;

    if (!isValid) {
      const firstErrorId = Object.keys(newErrors)[0];
      document
        .getElementById(`card-${firstErrorId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitAttempted(true);

    if (validateForm()) {
      onSubmit(buildCleanedAnswers(visibleQuestions, answers));
    }
  };

  const openReview = () => setView("review");

  const editAnswer = (questionId: string) => {
    scrollTargetRef.current = questionId;
    setView("form");
  };

  // Submitting from the review screen checks everything again: if something is wrong, the
  // respondent lands on the form at the first problem, with the errors shown.
  const submitFromReview = () => {
    setIsSubmitAttempted(true);
    const errors = validateAll(visibleQuestions, answers);
    setLocalErrors(errors);

    if (Object.keys(errors).length > 0) {
      scrollTargetRef.current = Object.keys(errors)[0];
      setView("form");
      return;
    }

    onSubmit(buildCleanedAnswers(visibleQuestions, answers));
  };

  const headerRight = (
    <>
      <SaveIndicator status={saveStatus} />
      {languageSwitcher}
    </>
  );

  if (view === "review") {
    const items = buildReviewItems({
      questions: visibleQuestions,
      shownAnswers,
      answers,
      errors: validateAll(visibleQuestions, answers),
      fallbackText: (number) => t("viewer.questionFallback", { number }),
      labels: {
        locale: i18n.language,
        yes: t("viewer.stepper.booleanYes"),
        no: t("viewer.stepper.booleanNo"),
        empty: t("viewer.stepper.noAnswer"),
      },
      fileName: (id) => uploadedFiles.get(id)?.name,
    });

    return (
      <ViewerShell
        title={formTitle}
        headerRight={headerRight}
        progress={progress.percent}
        progressLabel={t("viewer.progress.answered", {
          answered: progress.answered,
          total: progress.total,
        })}
        notice={notice}
      >
        <ReviewScreen
          items={items}
          description={formDescription}
          headingRef={reviewHeadingRef}
          onEdit={editAnswer}
          onBack={() => setView("form")}
          onSubmit={submitFromReview}
        />
      </ViewerShell>
    );
  }

  return (
    <ViewerShell
      title={formTitle}
      headerRight={headerRight}
      progress={progress.percent}
      progressLabel={t("viewer.progress.answered", {
        answered: progress.answered,
        total: progress.total,
      })}
      notice={notice}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <section className="rounded-2xl border border-slate-200 border-t-4 border-t-indigo-600 bg-surface p-5 shadow-sm sm:p-8">
          {logoUrl && <FormLogo url={logoUrl} />}
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{formTitle}</h1>
          {formDescription && (
            <p className="mt-2 whitespace-pre-line text-sm text-slate-500 sm:text-base">
              {formDescription}
            </p>
          )}

          <div className="mt-5 flex items-center gap-3 border-t border-slate-200 pt-5">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-600"
            >
              {progress.answered}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {t("viewer.progress.answered", {
                  answered: progress.answered,
                  total: progress.total,
                })}
              </p>
              <p className="text-xs text-slate-500">{t("viewer.progress.hint")}</p>
            </div>
          </div>
        </section>

        {visibleQuestions.map((question, index) => {
          const qId = question.id || `q-${index}`;
          const error = combinedErrors[qId];
          const labelId = `${qId}-label`;
          const errorId = `${qId}-error`;

          return (
            <ViewerQuestionCard
              key={qId}
              cardId={`card-${qId}`}
              number={index + 1}
              labelId={labelId}
              htmlFor={qId}
              text={question.text || t("viewer.questionFallback", { number: index + 1 })}
              required={question.required}
              requiredAriaLabel={t("viewer.requiredQuestionAriaLabel")}
              description={question.description}
              error={error ? t(error.key, error.params) : undefined}
              errorId={errorId}
            >
              <QuestionField
                question={question}
                qId={qId}
                value={shownAnswers[qId]}
                onChange={(value) => handleAnswerChange(qId, value)}
                otherValue={answers[otherAnswerKey(qId)]}
                onOtherChange={(text) => handleOtherChange(qId, text)}
                labelledBy={labelId}
                describedBy={error ? errorId : undefined}
                invalid={!!error}
                shareId={shareId}
                sessionKey={sessionKey}
              />
            </ViewerQuestionCard>
          );
        })}

        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t("viewer.submitBar.title")}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {missingRequired > 0
                ? t("viewer.submitBar.missingRequired", { count: missingRequired })
                : t("viewer.submitBar.allSet")}
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 cursor-pointer"
            >
              {t("viewer.submit")}
              <ArrowRightIcon />
            </button>
            <button
              type="button"
              onClick={openReview}
              className="h-9 rounded-lg px-3 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
            >
              {t("viewer.submitBar.review")}
            </button>
          </div>
        </section>
      </form>
    </ViewerShell>
  );
}

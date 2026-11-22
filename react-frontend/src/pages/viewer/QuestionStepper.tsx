import { otherAnswerKey } from "@quorvia/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { type Question } from "../../types/formBuilder";
import { type FormAnswers } from "../../types/formViewer";
import QuestionField from "./components/QuestionField";
import { buildReviewItems } from "./reviewItems";
import FormLogo from "./components/FormLogo";
import ViewerShell from "./components/ViewerShell";
import ViewerQuestionCard from "./components/ViewerQuestionCard";
import ReviewScreen from "./components/ReviewScreen";
import SaveIndicator from "./components/SaveIndicator";
import { useUploadedFiles } from "./uploadedFilesContext";
import {
  getDefaultAnswer,
  validateField,
  validateAll,
  buildCleanedAnswers,
  type FieldValidationError,
} from "./questionValidation";
import { sortByOrder, getNextQuestion } from "./questionFlow";
import { useAttemptAutosave } from "./hooks/useAttemptAutosave";
import StepTransition, { type StepDirection } from "./components/StepTransition";
import { resolveVisibleQuestionIds, type QuestionLike } from "@quorvia/condition-engine";
import { isHiddenCalculation, useCalculatedValues, withCalculatedValues } from "./calculations";

interface QuestionStepperProps {
  formTitle: string;
  // Public URL of the form logo, shown above the question.
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
  // Builder preview: no page chrome, a way to jump to a question from outside, and a report of
  // what is on screen (the current question, the questions the conditions currently show).
  embedded?: boolean;
  focusQuestionId?: string | null;
  onViewChange?: (view: StepperView) => void;
}

export interface StepperView {
  currentId: string | null;
  // 0-based position in the visible path; equals total on the review screen.
  index: number;
  total: number;
  isReview: boolean;
  visibleIds: string[];
}

export default function QuestionStepper({
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
  embedded = false,
  focusQuestionId,
  onViewChange,
}: QuestionStepperProps) {
  const { t, i18n } = useTranslation();
  // A calculation hidden from the respondent is never shown (the server does not even send it).
  const questions = useMemo(
    () => allQuestions.filter((q) => !isHiddenCalculation(q)),
    [allQuestions],
  );
  const orderedQuestions = useMemo(() => sortByOrder(questions), [questions]);

  const [answers, setAnswers] = useState<FormAnswers>(() => {
    const initial: FormAnswers = {};
    orderedQuestions.forEach((q, index) => {
      // A calculation has no answer of its own: its value is computed.
      if (q.type === "CALCULATION") return;
      const qId = q.id || `q-${index}`;
      initial[qId] = getDefaultAnswer(q);
    });
    return initial;
  });

  const [path, setPath] = useState<Question[]>(() => {
    const first = getNextQuestion(orderedQuestions, {}, -Infinity);
    return first ? [first] : [];
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [localErrors, setLocalErrors] = useState<Record<string, FieldValidationError>>({});

  const [direction, setDirection] = useState<StepDirection>(1);

  const stepHeadingRef = useRef<HTMLElement | null>(null);

  // Focus the step heading when the screen MOUNTS, not when the index changes: with animation the
  // old screen is still in the DOM when the index has already changed, and focus would go to the
  // leaving screen. A stable callback ref fires only when the element appears/disappears, not on
  // every render (otherwise focus would be stolen from input fields on every keystroke).
  const setHeadingRef = useCallback((el: HTMLElement | null) => {
    stepHeadingRef.current = el;
    el?.focus();
  }, []);

  const goTo = (index: number) => {
    setDirection(index >= currentIndex ? 1 : -1);
    setCurrentIndex(index);
  };

  const [isSubmitAttempted, setIsSubmitAttempted] = useState(false);

  const isReview = currentIndex >= path.length;

  // The builder asks to show a question (the one selected in its list): jump there if the
  // respondent would see it. Done while rendering, when the requested question changes, so the
  // view never shows the old step first; the preview can then be navigated freely again.
  const [appliedFocus, setAppliedFocus] = useState(focusQuestionId);
  if (focusQuestionId !== appliedFocus) {
    setAppliedFocus(focusQuestionId);

    if (focusQuestionId) {
      // A question the respondent has not reached yet is reached by following the form's own
      // flow with the answers given so far (the same getNextQuestion the "Next" button uses), so
      // the preview can show any question that the current answers would lead to.
      let extended = path;
      while (!extended.some((q) => q.id === focusQuestionId)) {
        const last = extended[extended.length - 1];
        const next = last ? getNextQuestion(orderedQuestions, answers, last.order) : null;
        if (!next) break;
        extended = [...extended, next];
      }

      const index = extended.findIndex((q) => q.id === focusQuestionId);
      if (index !== -1) {
        if (extended !== path) setPath(extended);
        setCurrentIndex(index);
      }
    }
  }

  const visibleIdsKey = path.map((q) => q.id ?? "").join("|");
  useEffect(() => {
    onViewChange?.({
      currentId: path[currentIndex]?.id ?? null,
      index: currentIndex,
      total: path.length,
      isReview,
      visibleIds: path.map((q) => q.id ?? ""),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, visibleIdsKey, isReview]);
  const current = isReview ? null : path[currentIndex];

  // Questions the respondent actually saw on screen: the path to the current step (the whole path on
  // review). Not to be confused with "logically visible": in a linear form all are visible at once,
  // but only the passed ones were seen. The server accumulates this list (merges it with earlier
  // saves), so going Back or changing a branch does not "unsee" an already seen question.
  const reachedQuestionIds = useMemo(
    () =>
      path
        .slice(0, isReview ? path.length : currentIndex + 1)
        .map((q) => q.id)
        .filter((id): id is string => !!id),
    [path, currentIndex, isReview],
  );

  const { status: saveStatus } = useAttemptAutosave(
    shareId,
    sessionKey,
    answers,
    reachedQuestionIds,
  );

  // Calculation fields: the value for the answers so far, from the same engine the server runs. The
  // visible questions are the logical ones, as on the server (an old answer to a question a branch
  // closed does not count).
  const visibleQuestionIds = useMemo(
    () => resolveVisibleQuestionIds(questions as unknown as QuestionLike[], answers),
    [questions, answers],
  );
  const calculated = useCalculatedValues(questions, answers, visibleQuestionIds);
  const shownAnswers = useMemo(
    () => withCalculatedValues(answers, calculated),
    [answers, calculated],
  );
  const uploadedFiles = useUploadedFiles();
  const combinedErrors = { ...serverErrors, ...localErrors };

  const handleAnswerChange = (questionId: string, value: FormAnswers[string]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (serverErrors[questionId] && onClearServerError) onClearServerError(questionId);
    if (localErrors[questionId]) {
      setLocalErrors((prev) => {
        const copy = { ...prev };
        delete copy[questionId];
        return copy;
      });
    }
  };

  const handleOtherChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [otherAnswerKey(questionId)]: text }));
    if (serverErrors[questionId] && onClearServerError) onClearServerError(questionId);
    if (localErrors[questionId]) {
      setLocalErrors((prev) => {
        const copy = { ...prev };
        delete copy[questionId];
        return copy;
      });
    }
  };

  const handleNext = () => {
    if (!current) return;
    const qId = current.id || `q-${currentIndex}`;

    const error = validateField(current, answers[qId], answers[otherAnswerKey(qId)]);
    if (error) {
      setLocalErrors({ [qId]: error });
      return;
    }
    setLocalErrors({});

    const next = getNextQuestion(orderedQuestions, answers, current.order);

    setPath((prev) => {
      const truncated = prev.slice(0, currentIndex + 1);
      return next ? [...truncated, next] : truncated;
    });

    goTo(currentIndex + 1);
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      goTo(currentIndex - 1);
      setLocalErrors({});
    }
  };

  const handleFinalSubmit = () => {
    setIsSubmitAttempted(true);
    const newErrors = validateAll(path, answers);

    if (Object.keys(newErrors).length > 0) {
      setLocalErrors(newErrors);
      const firstInvalidId = Object.keys(newErrors)[0];
      const invalidIndex = path.findIndex((q) => (q.id || "") === firstInvalidId);
      if (invalidIndex !== -1) goTo(invalidIndex);
      return;
    }

    onSubmit(buildCleanedAnswers(path, answers));
  };

  if (path.length === 0) {
    return (
      <ViewerShell
        title={formTitle}
        headerRight={languageSwitcher}
        notice={notice}
        centered
        embedded={embedded}
      >
        <p className="text-center text-sm text-slate-500">{t("viewer.noQuestions")}</p>
      </ViewerShell>
    );
  }

  const headerRight = (
    <>
      <SaveIndicator status={saveStatus} />
      {languageSwitcher}
    </>
  );

  // The total is unknown while branches can still change the path, so the bar is an estimate
  // that slows down the further the respondent goes and fills up on the review screen.
  const progress = isReview
    ? 100
    : Math.round(Math.min(95, ((currentIndex + 0.5) / (currentIndex + 2)) * 100));

  const currentId = current ? current.id || `q-${currentIndex}` : "";
  const currentError = combinedErrors[currentId];

  return (
    <ViewerShell
      title={formTitle}
      headerRight={headerRight}
      progress={progress}
      progressLabel={
        isReview
          ? t("viewer.stepper.reviewLabel")
          : t("viewer.stepper.questionLabel", { number: currentIndex + 1 })
      }
      notice={notice}
      width="lg"
      embedded={embedded}
    >
      <div className="space-y-4">
        {logoUrl && <FormLogo url={logoUrl} />}
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {isReview
            ? t("viewer.stepper.reviewLabel")
            : t("viewer.stepper.questionLabel", { number: currentIndex + 1 })}
        </p>

        <StepTransition
          stepKey={isReview ? "review" : `q-${current?.id ?? currentIndex}`}
          direction={direction}
        >
          {isReview ? (
            <ReviewScreen
              items={buildReviewItems({
                questions: path,
                shownAnswers,
                answers,
                errors: localErrors,
                fallbackText: (number) => t("viewer.questionFallback", { number }),
                labels: {
                  locale: i18n.language,
                  yes: t("viewer.stepper.booleanYes"),
                  no: t("viewer.stepper.booleanNo"),
                  empty: t("viewer.stepper.noAnswer"),
                },
                fileName: (id) => uploadedFiles.get(id)?.name,
              })}
              description={formDescription}
              headingRef={setHeadingRef}
              onEdit={(id) => {
                const index = path.findIndex((q, i) => (q.id || `q-${i}`) === id);
                if (index !== -1) goTo(index);
              }}
              onBack={handleBack}
              onSubmit={handleFinalSubmit}
              errorHint={
                isSubmitAttempted && Object.keys(localErrors).length > 0
                  ? t("viewer.stepper.reviewErrorsHint")
                  : undefined
              }
            />
          ) : (
            current && (
              <div className="space-y-4">
                <ViewerQuestionCard
                  cardId={`card-${currentId}`}
                  number={currentIndex + 1}
                  labelId={`${current.id || currentIndex}-label`}
                  htmlFor={current.id || `q-${currentIndex}`}
                  text={current.text || t("viewer.questionFallback", { number: currentIndex + 1 })}
                  required={current.required}
                  requiredAriaLabel={t("viewer.requiredQuestionAriaLabel")}
                  description={current.description}
                  error={currentError ? t(currentError.key, currentError.params) : undefined}
                  errorId={`${current.id || currentIndex}-error`}
                  size="lg"
                  headerRef={setHeadingRef}
                >
                  <QuestionField
                    question={current}
                    qId={currentId}
                    value={shownAnswers[currentId]}
                    onChange={(value) => handleAnswerChange(currentId, value)}
                    otherValue={answers[otherAnswerKey(currentId)]}
                    onOtherChange={(text) => handleOtherChange(currentId, text)}
                    labelledBy={`${current.id || currentIndex}-label`}
                    describedBy={currentError ? `${current.id || currentIndex}-error` : undefined}
                    invalid={!!currentError}
                    shareId={shareId}
                    sessionKey={sessionKey}
                  />
                </ViewerQuestionCard>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={currentIndex === 0}
                    className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-0 cursor-pointer"
                  >
                    {t("viewer.stepper.back")}
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 cursor-pointer"
                  >
                    {t("viewer.stepper.next")}
                  </button>
                </div>
              </div>
            )
          )}
        </StepTransition>
      </div>
    </ViewerShell>
  );
}

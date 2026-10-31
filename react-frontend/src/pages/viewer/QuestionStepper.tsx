import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Question } from "../../types/formBuilder";
import { type FormAnswers } from "../../types/formViewer";
import { ErrorInfo } from "../../components/ui/ErrorInfo";
import QuestionField from "./components/QuestionField";
import {
  getDefaultAnswer,
  validateField,
  validateAll,
  buildCleanedAnswers,
  type FieldValidationError,
} from "./questionValidation";
import { sortByOrder, getNextQuestion } from "./questionFlow";
import { useAttemptAutosave } from "./hooks/useAttemptAutosave";

interface QuestionStepperProps {
  formTitle: string;
  formDescription?: string;
  questions: Question[];
  onSubmit: (data: FormAnswers) => void;
  serverErrors?: Record<string, FieldValidationError>;
  onClearServerError?: (fieldId: string) => void;
  shareId?: string;
  sessionKey?: string;
}

export default function QuestionStepper({
  formTitle,
  formDescription,
  questions,
  onSubmit,
  serverErrors = {},
  onClearServerError,
  shareId,
  sessionKey = "",
}: QuestionStepperProps) {
  const { t } = useTranslation();
  const orderedQuestions = useMemo(() => sortByOrder(questions), [questions]);

  const [answers, setAnswers] = useState<FormAnswers>(() => {
    const initial: FormAnswers = {};
    orderedQuestions.forEach((q, index) => {
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

  const stepHeadingRef = useRef<HTMLElement>(null);

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [currentIndex]);

  const [isSubmitAttempted, setIsSubmitAttempted] = useState(false);

  const isReview = currentIndex >= path.length;
  const current = isReview ? null : path[currentIndex];

  // Питання, які респондент реально побачив на екрані: шлях до поточного
  // кроку (на review - увесь шлях). Не плутати з "логічно видимими" - у
  // лінійній формі вони видимі всі одразу, а побачено лише пройдене.
  // Сервер накопичує цей список (об'єднує з попередніми збереженнями), тож
  // повернення Назад або зміна гілки не "розвидяють" уже побачене питання.
  const reachedQuestionIds = useMemo(
    () =>
      path
        .slice(0, isReview ? path.length : currentIndex + 1)
        .map((q) => q.id)
        .filter((id): id is string => !!id),
    [path, currentIndex, isReview],
  );

  useAttemptAutosave(shareId, sessionKey, answers, reachedQuestionIds);
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

  const handleNext = () => {
    if (!current) return;
    const qId = current.id || `q-${currentIndex}`;

    const error = validateField(current, answers[qId]);
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

    setCurrentIndex((i) => i + 1);
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
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
      if (invalidIndex !== -1) setCurrentIndex(invalidIndex);
      return;
    }

    onSubmit(buildCleanedAnswers(path, answers));
  };

  if (path.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <p className="text-sm text-slate-400">{t("viewer.noQuestions")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 flex flex-col items-center">
      <div className="w-full max-w-xl space-y-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
          <span>{formTitle}</span>
          <span>
            {isReview
              ? t("viewer.stepper.reviewLabel")
              : t("viewer.stepper.questionLabel", { number: currentIndex + 1 })}
          </span>
        </div>

        <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-300"
            style={{
              width: isReview
                ? "100%"
                : `${Math.min(95, ((currentIndex + 0.5) / (currentIndex + 2)) * 100)}%`,
            }}
          />
        </div>

        {isReview ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5 animate-in fade-in duration-200">
            <div>
              <h2
                ref={(el) => {
                  stepHeadingRef.current = el;
                }}
                tabIndex={-1}
                className="text-xl font-bold text-slate-900 focus:outline-none"
              >
                {t("viewer.stepper.reviewTitle")}
              </h2>
              {formDescription && <p className="text-sm text-slate-500 mt-1">{formDescription}</p>}
            </div>

            <ul className="space-y-2">
              {path.map((q, i) => (
                <li
                  key={q.id || i}
                  className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0"
                >
                  <span className="text-xs text-slate-400">
                    {q.text || t("viewer.questionFallback", { number: i + 1 })}
                    {" - "}
                    {answers[q.id!].toString()}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentIndex(i)}
                    className="text-left text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer pl-4"
                  >
                    <span className="text-xs">{t("viewer.stepper.changeAnswer")}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {t("viewer.stepper.back")}
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                className="inline-flex h-11 items-center rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white hover:bg-indigo-500 shadow-sm transition-colors cursor-pointer"
              >
                {t("viewer.submit")}
              </button>
            </div>
          </div>
        ) : (
          current && (
            <div
              key={current.id || currentIndex}
              className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5 animate-in fade-in slide-in-from-right-2 duration-200"
            >
              <div
                ref={(el) => {
                  stepHeadingRef.current = el;
                }}
                tabIndex={-1}
                className="focus:outline-none"
              >
                <label
                  id={`${current.id || currentIndex}-label`}
                  htmlFor={current.id || `q-${currentIndex}`}
                  className="text-lg font-bold text-slate-800 flex items-center gap-1"
                >
                  {current.text || t("viewer.questionFallback", { number: currentIndex + 1 })}
                  {current.required && (
                    <span
                      className="text-rose-500"
                      aria-label={t("viewer.requiredQuestionAriaLabel")}
                    >
                      *
                    </span>
                  )}
                </label>
                {current.description && (
                  <p className="text-xs text-slate-400 mt-1">{current.description}</p>
                )}
              </div>

              <QuestionField
                question={current}
                qId={current.id || `q-${currentIndex}`}
                value={answers[current.id || `q-${currentIndex}`]}
                onChange={(value) => handleAnswerChange(current.id || `q-${currentIndex}`, value)}
                labelledBy={`${current.id || currentIndex}-label`}
                describedBy={
                  combinedErrors[current.id || `q-${currentIndex}`]
                    ? `${current.id || currentIndex}-error`
                    : undefined
                }
                invalid={!!combinedErrors[current.id || `q-${currentIndex}`]}
              />

              {combinedErrors[current.id || `q-${currentIndex}`] && (
                <div id={`${current.id || currentIndex}-error`}>
                  <ErrorInfo
                    errorText={t(
                      combinedErrors[current.id || `q-${currentIndex}`].key,
                      combinedErrors[current.id || `q-${currentIndex}`].params,
                    )}
                  />
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={currentIndex === 0}
                  className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-0 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  {t("viewer.stepper.back")}
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex h-11 items-center rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white hover:bg-indigo-500 shadow-sm transition-colors cursor-pointer"
                >
                  {t("viewer.stepper.next")}
                </button>
              </div>
            </div>
          )
        )}

        {isSubmitAttempted && Object.keys(localErrors).length > 0 && isReview && (
          <p className="text-xs text-rose-600 text-center">
            {t("viewer.stepper.reviewErrorsHint")}
          </p>
        )}
      </div>
    </div>
  );
}

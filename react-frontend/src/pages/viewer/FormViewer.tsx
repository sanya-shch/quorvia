import { otherAnswerKey } from "@quorvia/shared-types";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Question } from "../../types/formBuilder";
import { type FormAnswers } from "../../types/formViewer";
import { ErrorInfo } from "../../components/ui/ErrorInfo";
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
}: FormViewerProps) {
  const { t } = useTranslation();
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

  useAttemptAutosave(shareId, sessionKey, answers);

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

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6">
      <form onSubmit={handleSubmit} noValidate className="max-w-2xl mx-auto space-y-6">
        <div className="bg-surface rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm border-t-8 border-t-indigo-600">
          {logoUrl && <FormLogo url={logoUrl} />}
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{formTitle}</h1>
          {formDescription && <p className="text-sm text-slate-500 mt-2">{formDescription}</p>}
        </div>

        {visibleQuestions.map((question, index) => {
          const qId = question.id || `q-${index}`;
          const hasError = !!combinedErrors[qId];
          const labelId = `${qId}-label`;
          const errorId = `${qId}-error`;

          return (
            <div
              key={qId}
              id={`card-${qId}`}
              className={`bg-surface rounded-2xl border p-6 shadow-sm space-y-4 transition-all duration-200 ${
                hasError
                  ? "border-rose-500 ring-2 ring-rose-100 shadow-rose-100/50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                <label
                  id={labelId}
                  htmlFor={qId}
                  className="text-base font-bold text-slate-800 flex items-center gap-1"
                >
                  {question.text || t("viewer.questionFallback", { number: index + 1 })}
                  {question.required && (
                    <span
                      className="text-rose-500"
                      aria-label={t("viewer.requiredQuestionAriaLabel")}
                    >
                      *
                    </span>
                  )}
                </label>
                {question.description && (
                  <p className="text-xs text-slate-500 mt-0.5">{question.description}</p>
                )}
              </div>

              <QuestionField
                question={question}
                qId={qId}
                value={shownAnswers[qId]}
                onChange={(value) => handleAnswerChange(qId, value)}
                otherValue={answers[otherAnswerKey(qId)]}
                onOtherChange={(text) => handleOtherChange(qId, text)}
                labelledBy={labelId}
                describedBy={hasError ? errorId : undefined}
                invalid={hasError}
                shareId={shareId}
                sessionKey={sessionKey}
              />

              {hasError && (
                <div id={errorId}>
                  <ErrorInfo errorText={t(combinedErrors[qId].key, combinedErrors[qId].params)} />
                </div>
              )}
            </div>
          );
        })}

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className="w-full sm:w-auto inline-flex h-11 items-center justify-center rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-on-primary hover:bg-indigo-500 shadow-sm transition-colors focus:outline-none cursor-pointer"
          >
            {t("viewer.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

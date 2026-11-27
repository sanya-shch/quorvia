import type { ReactNode, Ref } from "react";
import { ErrorInfo } from "../../../components/ui/ErrorInfo";

interface ViewerQuestionCardProps {
  // The DOM id of the card ("card-<questionId>"): "Edit" and the first error scroll to it.
  cardId: string;
  // The question's place in the form, shown in the round badge.
  number: number;
  labelId: string;
  htmlFor: string;
  text: string;
  required?: boolean;
  requiredAriaLabel: string;
  description?: string;
  error?: string;
  errorId: string;
  // "lg" is the one-question-at-a-time mode: the question is the only thing on the screen.
  size?: "md" | "lg";
  // Receives focus when a step opens (step-by-step mode).
  headerRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

// One question of the public form: a numbered card whose badge and border light up while a field
// inside it has focus, and turn red when the answer is wrong.
export default function ViewerQuestionCard({
  cardId,
  number,
  labelId,
  htmlFor,
  text,
  required,
  requiredAriaLabel,
  description,
  error,
  errorId,
  size = "md",
  headerRef,
  children,
}: ViewerQuestionCardProps) {
  const hasError = Boolean(error);

  return (
    <section
      id={cardId}
      className={`group rounded-2xl border bg-surface p-5 shadow-sm transition-all duration-200 sm:p-6 ${
        hasError
          ? "border-rose-500 ring-2 ring-rose-100"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
            hasError ? "bg-rose-600 text-on-primary" : "bg-slate-100 text-slate-600"
          }`}
        >
          {number}
        </span>

        <div className="min-w-0 flex-1 space-y-4">
          <div ref={headerRef} tabIndex={headerRef ? -1 : undefined} className="focus:outline-none">
            <label
              id={labelId}
              htmlFor={htmlFor}
              className={`flex items-start gap-1 font-semibold text-slate-900 ${
                size === "lg" ? "text-lg sm:text-xl" : "text-base"
              }`}
            >
              <span>{text}</span>
              {required && (
                <span className="text-rose-700" aria-label={requiredAriaLabel}>
                  *
                </span>
              )}
            </label>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>

          {children}

          {hasError && (
            <div id={errorId}>
              <ErrorInfo errorText={error!} variant="block" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

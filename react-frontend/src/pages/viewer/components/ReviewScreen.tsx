import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { ReviewItem } from "../reviewItems";
import { ArrowLeftIcon, ArrowRightIcon, EyeIcon, InfoIcon } from "./viewerIcons";

interface ReviewScreenProps {
  items: ReviewItem[];
  // Opens the question with this id for editing.
  onEdit: (id: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  // Description of the form, shown under the title when there is one.
  description?: string;
  // Receives focus when the screen opens.
  headingRef?: Ref<HTMLHeadingElement>;
  // A hint under the list: the answers could not be sent because some are wrong.
  errorHint?: string;
}

// "Review your answers": every answer of the respondent as text, with a way back to change any of
// them, then the final submit. Used by both completion modes: step-by-step opens it after the last
// question, and the all-at-once form opens it from "Review answers".
export default function ReviewScreen({
  items,
  onEdit,
  onBack,
  onSubmit,
  description,
  headingRef,
  errorHint,
}: ReviewScreenProps) {
  const { t } = useTranslation();
  const answeredCount = items.filter((item) => item.answered).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center gap-2 rounded-xl px-3 -ml-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
        >
          <ArrowLeftIcon />
          {t("viewer.review.back")}
        </button>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
          {t("viewer.review.finalStep")}
        </span>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-sm">
        <div className="space-y-5 p-5 sm:p-8">
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"
            >
              <EyeIcon />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                {t("viewer.review.eyebrow")}
              </p>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="mt-1 text-2xl font-bold text-slate-900 focus:outline-none sm:text-3xl"
              >
                {t("viewer.stepper.reviewTitle")}
              </h2>
              <p className="mt-2 text-sm text-slate-500 sm:text-base">
                {description || t("viewer.review.intro")}
              </p>
            </div>
          </div>

          <p className="flex items-start gap-3 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
            {t("viewer.review.notice")}
          </p>
        </div>

        {items.length === 0 ? (
          <p className="border-t border-slate-200 px-5 py-8 text-center text-sm text-slate-500 sm:px-8">
            {t("viewer.review.empty")}
          </p>
        ) : (
          <ol className="border-t border-slate-200">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 border-b border-slate-200 px-5 py-4 last:border-b-0 sm:gap-4 sm:px-8 sm:py-5"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    item.missingRequired
                      ? "bg-rose-600 text-on-primary"
                      : "bg-indigo-50 text-indigo-600"
                  }`}
                >
                  {item.number}
                </span>

                <div className="min-w-0 flex-1">
                  <p id={`review-${item.id}`} className="text-sm text-slate-500">
                    {item.question}
                  </p>
                  <p
                    className={`mt-1 whitespace-pre-line break-words text-base ${
                      item.answered
                        ? "font-semibold text-slate-900"
                        : item.missingRequired
                          ? "font-semibold text-rose-600"
                          : "text-slate-400"
                    }`}
                  >
                    {item.missingRequired ? t("viewer.review.requiredMissing") : item.answer}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onEdit(item.id)}
                  aria-describedby={`review-${item.id}`}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                >
                  {t("viewer.stepper.changeAnswer")}
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-200 bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-sm text-slate-500">
            {t("viewer.review.summary", { count: answeredCount })} · {t("viewer.review.autosaved")}
          </p>
          <button
            type="button"
            onClick={onSubmit}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 cursor-pointer sm:w-auto"
          >
            {t("viewer.submit")}
            <ArrowRightIcon />
          </button>
        </div>
      </section>

      {errorHint && (
        <p role="alert" className="text-center text-xs text-rose-600">
          {errorHint}
        </p>
      )}
    </div>
  );
}

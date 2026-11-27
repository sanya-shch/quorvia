import { useId } from "react";
import { useTranslation } from "react-i18next";
import { SCORE_LIMITS } from "@quorvia/shared-types";
import type { ScoringDraft } from "../../../types/formBuilder";
import { canAddCategory, findCategoryIssues, newCategoryId } from "../scoring";

interface ScoringEditorProps {
  scoring: ScoringDraft | null | undefined;
  onChange: (scoring: ScoringDraft | null) => void;
}

const inputClass =
  "h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const buttonClass =
  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

// Scoring of the whole form: the switch, and the categories of the total ("0-30 Beginner"). The
// points of each answer are set in the questions, once scoring is on. The settings are saved with
// the form; categories that are not finished are not saved, and the card says so.
export default function ScoringEditor({ scoring, onChange }: ScoringEditorProps) {
  const { t } = useTranslation();
  const id = useId();

  const draft: ScoringDraft = scoring ?? { enabled: false, categories: [] };
  const issues = findCategoryIssues(draft);

  const update = (patch: Partial<ScoringDraft>) => onChange({ ...draft, ...patch });

  const patchCategory = (index: number, patch: Partial<ScoringDraft["categories"][number]>) =>
    update({
      categories: draft.categories.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });

  return (
    <div className="space-y-3">
      <label className="flex w-fit cursor-pointer select-none items-center gap-2">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-sm font-semibold text-slate-700">{t("builder.scoring.enable")}</span>
      </label>
      <p className="text-xs text-slate-500">{t("builder.scoring.hint")}</p>

      {draft.enabled && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {t("builder.scoring.categoriesTitle")}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{t("builder.scoring.categoriesHint")}</p>
          </div>

          {draft.categories.map((category, index) => {
            const issue = issues[index];

            return (
              <div
                key={category.id}
                role="group"
                aria-label={category.label.trim() || t("builder.scoring.untitledCategory")}
                className="space-y-1.5"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-40 flex-1">
                    <label
                      htmlFor={`${id}-${category.id}-label`}
                      className="block text-xs font-semibold text-slate-600"
                    >
                      {t("builder.scoring.categoryName")}
                    </label>
                    <input
                      id={`${id}-${category.id}-label`}
                      type="text"
                      value={category.label}
                      maxLength={SCORE_LIMITS.categoryLabel}
                      onChange={(e) => patchCategory(index, { label: e.target.value })}
                      className={`${inputClass} mt-1 w-full`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`${id}-${category.id}-min`}
                      className="block text-xs font-semibold text-slate-600"
                    >
                      {t("builder.scoring.from")}
                    </label>
                    <input
                      id={`${id}-${category.id}-min`}
                      type="text"
                      inputMode="decimal"
                      value={category.min}
                      onChange={(e) => patchCategory(index, { min: e.target.value })}
                      className={`${inputClass} mt-1 w-24`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`${id}-${category.id}-max`}
                      className="block text-xs font-semibold text-slate-600"
                    >
                      {t("builder.scoring.to")}
                    </label>
                    <input
                      id={`${id}-${category.id}-max`}
                      type="text"
                      inputMode="decimal"
                      value={category.max}
                      onChange={(e) => patchCategory(index, { max: e.target.value })}
                      className={`${inputClass} mt-1 w-24`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      update({ categories: draft.categories.filter((_, i) => i !== index) })
                    }
                    aria-label={t("builder.scoring.removeCategory")}
                    title={t("builder.scoring.removeCategory")}
                    className="h-9 w-9 cursor-pointer rounded-lg border border-slate-200 bg-white text-xs text-slate-500 hover:border-rose-300 hover:text-rose-700"
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </div>

                {issue && (
                  <p
                    role="alert"
                    className={`text-xs font-medium ${issue === "incomplete" ? "text-amber-700" : "text-rose-700"}`}
                  >
                    {t(`builder.scoring.issues.${issue}`)}
                  </p>
                )}
              </div>
            );
          })}

          <button
            type="button"
            disabled={!canAddCategory(draft)}
            onClick={() =>
              update({
                categories: [
                  ...draft.categories,
                  { id: newCategoryId(), label: "", min: "", max: "" },
                ],
              })
            }
            className={`${buttonClass} border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50`}
          >
            {t("builder.scoring.addCategory")}
          </button>

          <p className="text-xs text-slate-500">{t("builder.scoring.placeholdersHint")}</p>
        </div>
      )}
    </div>
  );
}

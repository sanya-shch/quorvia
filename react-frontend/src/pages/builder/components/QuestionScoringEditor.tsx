import { useTranslation } from "react-i18next";
import type { Question } from "../../../types/formBuilder";
import ScoreInput from "./ScoreInput";
import { isScorableType, numberNeedsRange, withOptionScore } from "../scoring";

interface QuestionScoringEditorProps {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  // A full i18n key (see useFormBuilder.validate), shown under the fields.
  error?: string;
}

const rowClass = "flex items-center justify-between gap-3";

// The points one question gives, shown only while the form scores its responses. Which fields
// there are depends on the type: a number for every option of a choice question, one for "yes" and
// one for "no", or a factor for a number, rating, scale or NPS (points = the answer times it).
// Other types give no points, so they have nothing here.
export default function QuestionScoringEditor({
  question,
  onChange,
  error,
}: QuestionScoringEditorProps) {
  const { t } = useTranslation();

  if (!isScorableType(question.type)) return null;

  const isChoice =
    question.type === "CHOICE_SINGLE" ||
    question.type === "CHOICE_MULTI" ||
    question.type === "IMAGE_CHOICE";

  return (
    <div
      role="group"
      aria-label={t("builder.scoring.points")}
      className="mt-4 space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3"
    >
      <p className="text-xs font-semibold text-indigo-700">{t("builder.scoring.points")}</p>

      {isChoice && (
        <div className="space-y-1.5">
          {question.options.map((option) => (
            <div key={option.id} className={rowClass}>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                {option.text || t("builder.emptyOption")}
              </span>
              <ScoreInput
                label={t("builder.scoring.optionPoints", { text: option.text })}
                value={option.score}
                onChange={(score) =>
                  onChange({ options: withOptionScore(question.options, option.id, score) })
                }
              />
            </div>
          ))}
          {question.type === "CHOICE_MULTI" && (
            <p className="text-[11px] text-slate-500">{t("builder.scoring.multiHint")}</p>
          )}
        </div>
      )}

      {question.type === "BOOLEAN" && (
        <div className="space-y-1.5">
          {(["true", "false"] as const).map((key) => (
            <div key={key} className={rowClass}>
              <span className="text-sm text-slate-700">
                {key === "true" ? t("builder.scoring.yes") : t("builder.scoring.no")}
              </span>
              <ScoreInput
                label={
                  key === "true" ? t("builder.scoring.yesPoints") : t("builder.scoring.noPoints")
                }
                value={question.config?.score?.[key]}
                onChange={(score) => {
                  const current = question.config?.score ?? { true: 0, false: 0 };
                  const next = { ...current, [key]: score ?? 0 };
                  const empty = next.true === 0 && next.false === 0 && score === null;

                  onChange({
                    config: { ...question.config, score: empty ? null : next },
                  });
                }}
              />
            </div>
          ))}
        </div>
      )}

      {(question.type === "NUMBER" ||
        question.type === "RATING" ||
        question.type === "SCALE" ||
        question.type === "NPS") && (
        <div className="space-y-1.5">
          <div className={rowClass}>
            <span className="text-sm text-slate-700">{t("builder.scoring.multiplier")}</span>
            <ScoreInput
              label={t("builder.scoring.multiplier")}
              value={question.config?.scoreMultiplier}
              onChange={(scoreMultiplier) =>
                onChange({ config: { ...question.config, scoreMultiplier } })
              }
            />
          </div>
          <p className="text-[11px] text-slate-500">{t("builder.scoring.multiplierHint")}</p>
          {numberNeedsRange(question) && (
            <p role="alert" className="text-xs font-medium text-amber-700">
              {t("builder.scoring.numberRange")}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

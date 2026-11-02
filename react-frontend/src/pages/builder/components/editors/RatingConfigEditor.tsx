import { useId } from "react";
import { useTranslation } from "react-i18next";
import { SCALE_LIMITS } from "@quorvia/shared-types";
import { type QuestionConfig } from "../../../../types/formBuilder";

interface RatingConfigEditorProps {
  config: QuestionConfig | null;
  onChange: (newConfig: QuestionConfig) => void;
}

const OPTIONS = Array.from(
  { length: SCALE_LIMITS.ratingMax.max - SCALE_LIMITS.ratingMax.min + 1 },
  (_, i) => SCALE_LIMITS.ratingMax.min + i,
);

export default function RatingConfigEditor({ config, onChange }: RatingConfigEditorProps) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5 animate-in fade-in duration-150">
      <label htmlFor={id} className="text-xs font-semibold text-slate-500">
        {t("builder.editors.rating.max")}
      </label>
      <select
        id={id}
        value={config?.max ?? SCALE_LIMITS.ratingMax.default}
        onChange={(e) => onChange({ ...config, max: Number(e.target.value) })}
        className="h-10 w-32 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

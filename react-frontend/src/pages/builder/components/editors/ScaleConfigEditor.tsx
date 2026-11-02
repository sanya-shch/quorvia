import { useId } from "react";
import { useTranslation } from "react-i18next";
import { getScaleBounds, SCALE_LIMITS } from "@quorvia/shared-types";
import { type QuestionConfig } from "../../../../types/formBuilder";

interface ScaleConfigEditorProps {
  config: QuestionConfig | null;
  onChange: (newConfig: QuestionConfig) => void;
}

const selectClass =
  "h-10 w-24 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const inputClass =
  "h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function ScaleConfigEditor({ config, onChange }: ScaleConfigEditorProps) {
  const { t } = useTranslation();
  const id = useId();
  // Межі з getScaleBounds, а не з "сирого" config: для старих/неповних даних
  // редактор показує те саме, що побачить респондент.
  const { min, max } = getScaleBounds("SCALE", config);

  // Кінець шкали має бути строго більшим за початок.
  const endOptions = Array.from(
    { length: SCALE_LIMITS.scaleEnd.max - Math.max(SCALE_LIMITS.scaleEnd.min, min + 1) + 1 },
    (_, i) => Math.max(SCALE_LIMITS.scaleEnd.min, min + 1) + i,
  );

  const update = (patch: Partial<QuestionConfig>) =>
    onChange({ ...config, min, max, ...patch });

  const handleStartChange = (start: number) => {
    update({ min: start, max: Math.max(max, start + 1) });
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-150">
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-min`} className="text-xs font-semibold text-slate-500">
            {t("builder.editors.scale.start")}
          </label>
          <select
            id={`${id}-min`}
            value={min}
            onChange={(e) => handleStartChange(Number(e.target.value))}
            className={selectClass}
          >
            {SCALE_LIMITS.scaleStart.allowed.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-max`} className="text-xs font-semibold text-slate-500">
            {t("builder.editors.scale.end")}
          </label>
          <select
            id={`${id}-max`}
            value={max}
            onChange={(e) => update({ max: Number(e.target.value) })}
            className={selectClass}
          >
            {endOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-minLabel`} className="text-xs font-semibold text-slate-500">
            {t("builder.editors.scale.minLabel", { value: min })}
          </label>
          <input
            id={`${id}-minLabel`}
            type="text"
            maxLength={SCALE_LIMITS.labelMaxLength}
            value={config?.minLabel ?? ""}
            onChange={(e) => update({ minLabel: e.target.value })}
            placeholder={t("builder.editors.scale.labelPlaceholder")}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-maxLabel`} className="text-xs font-semibold text-slate-500">
            {t("builder.editors.scale.maxLabel", { value: max })}
          </label>
          <input
            id={`${id}-maxLabel`}
            type="text"
            maxLength={SCALE_LIMITS.labelMaxLength}
            value={config?.maxLabel ?? ""}
            onChange={(e) => update({ maxLabel: e.target.value })}
            placeholder={t("builder.editors.scale.labelPlaceholder")}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}

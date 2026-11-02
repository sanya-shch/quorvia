import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ErrorInfo } from "../../../../components/ui/ErrorInfo";
import { type QuestionConfig } from "../../../../types/formBuilder";

interface NumberConfigEditorProps {
  config: QuestionConfig | null;
  onChange: (newConfig: QuestionConfig) => void;
}

export default function NumberConfigEditor({ config, onChange }: NumberConfigEditorProps) {
  const { t } = useTranslation();
  const stepId = useId();
  const currentConfig = config || {};
  const minValue = currentConfig.min;
  const maxValue = currentConfig.max;

  const isSlider = currentConfig.numberVariant === "slider";
  const hasValidationError =
    minValue !== undefined &&
    maxValue !== undefined &&
    (isSlider ? minValue >= maxValue : minValue > maxValue);

  const updateConfig = (patch: Partial<QuestionConfig>) => {
    onChange({ ...currentConfig, ...patch });
  };

  const handleSliderToggle = (enabled: boolean) => {
    if (!enabled) {
      updateConfig({ numberVariant: "input", step: undefined });
      return;
    }

    // Слайдеру потрібен діапазон: підставляємо типовий, якщо межі не задані.
    updateConfig({
      numberVariant: "slider",
      min: minValue ?? 0,
      max: maxValue ?? 10,
      step: currentConfig.step ?? 1,
    });
  };

  const handleStepChange = (value: string) => {
    const parsed = parseFloat(value);
    updateConfig({ step: parsed > 0 ? parsed : undefined });
  };

  const handleNumberChange = (value: string, key: "min" | "max") => {
    if (!value) {
      // У режимі слайдера межі обов'язкові - порожнє значення ігноруємо.
      if (!isSlider) updateConfig({ [key]: undefined });
      return;
    }

    const parsed = parseFloat(value);
    const sanitizedValue = parsed < 0 ? 0 : parsed;

    updateConfig({ [key]: sanitizedValue });
  };

  return (
    <div className="flex flex-col gap-3 animate-in fade-in duration-150">
      <div className="flex gap-4">
        <div className="w-32 flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-500">
            {t("builder.editors.number.min")}
          </label>
          <input
            type="number"
            min={0}
            placeholder={t("builder.editors.number.noLimit")}
            value={minValue ?? ""}
            onChange={(e) => handleNumberChange(e.target.value, "min")}
            className={`h-10 rounded-xl border px-3 text-sm font-medium text-slate-700 focus:outline-none transition-colors ${
              hasValidationError
                ? "border-rose-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 bg-rose-50/30"
                : "border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            }`}
          />
        </div>

        <div className="w-32 flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-500">
            {t("builder.editors.number.max")}
          </label>
          <input
            type="number"
            min={0}
            placeholder={t("builder.editors.number.noLimit")}
            value={maxValue ?? ""}
            onChange={(e) => handleNumberChange(e.target.value, "max")}
            className={`h-10 rounded-xl border px-3 text-sm font-medium text-slate-700 focus:outline-none transition-colors ${
              hasValidationError
                ? "border-rose-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 bg-rose-50/30"
                : "border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            }`}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isSlider}
          onChange={(e) => handleSliderToggle(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        {t("builder.editors.number.slider")}
      </label>

      {isSlider && (
        <div className="w-32 flex flex-col gap-1.5">
          <label htmlFor={`${stepId}-step`} className="text-xs font-semibold text-slate-500">
            {t("builder.editors.number.step")}
          </label>
          <input
            id={`${stepId}-step`}
            type="number"
            min={0}
            step="any"
            value={currentConfig.step ?? 1}
            onChange={(e) => handleStepChange(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      )}

      {hasValidationError && (
        <ErrorInfo
          errorText={t(
            isSlider ? "builder.editors.number.sliderRangeError" : "builder.editors.number.minMaxError",
          )}
        />
      )}
    </div>
  );
}

import { useTranslation } from "react-i18next";
import type { AnswerValue } from "../../../types/formViewer";

interface NumberSliderProps {
  id: string;
  min: number;
  max: number;
  step: number;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  required: boolean;
  describedBy?: string;
  invalid?: boolean;
  labelledBy?: string;
}

// Keys the user can press to "set" the value without changing it from the starting one (the
// slider visually sits at min).
const MIN_KEYS = new Set(["Home", "ArrowLeft", "ArrowDown"]);

export default function NumberSlider({
  id,
  min,
  max,
  step,
  value,
  onChange,
  required,
  describedBy,
  invalid,
  labelledBy,
}: NumberSliderProps) {
  const { t } = useTranslation();
  const answered = typeof value === "number";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={answered ? value : min}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          onChange={(e) => onChange(Number(e.target.value))}
          // Without this an answer of exactly min is impossible: the slider already sits at min, so
          // change never fires. A touch/key press counts as an answer.
          onPointerDown={() => {
            if (!answered) onChange(min);
          }}
          onKeyDown={(e) => {
            if (!answered && MIN_KEYS.has(e.key)) onChange(min);
          }}
          className="h-2 flex-1 cursor-pointer accent-indigo-600"
        />
        <output
          htmlFor={id}
          className={`min-w-12 text-right text-sm font-semibold ${
            answered ? "text-slate-800" : "text-slate-500"
          }`}
        >
          {answered ? value : t("viewer.slider.notSet")}
        </output>
      </div>

      <div className="flex justify-between text-xs text-slate-500" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>

      {!required && answered && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs font-medium text-slate-500 underline hover:text-slate-600 cursor-pointer"
        >
          {t("viewer.scale.clear")}
        </button>
      )}
    </div>
  );
}

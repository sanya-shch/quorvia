import { useTranslation } from "react-i18next";
import type { AnswerValue } from "../../../types/formViewer";

interface ScaleFieldProps {
  /** Спільне ім'я групи радіокнопок (qId) - дає стрілки клавіатури "з коробки". */
  name: string;
  min: number;
  max: number;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  /** stars - зірки (RATING), numbers - ряд кнопок із числами (SCALE, NPS). */
  variant: "stars" | "numbers";
  required: boolean;
  labelledBy?: string;
  describedBy?: string;
  invalid?: boolean;
  minLabel?: string;
  maxLabel?: string;
}

const focusRing =
  "peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2";

export default function ScaleField({
  name,
  min,
  max,
  value,
  onChange,
  variant,
  required,
  labelledBy,
  describedBy,
  invalid,
  minLabel,
  maxLabel,
}: ScaleFieldProps) {
  const { t } = useTranslation();
  const points = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const selected = typeof value === "number" ? value : undefined;

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className={variant === "stars" ? "flex flex-wrap gap-1" : "flex flex-wrap gap-2"}
      >
        {points.map((point) => {
          const isSelected = selected === point;
          // Зірки підсвічуються до вибраної включно, числа - лише вибране.
          const isFilled =
            variant === "stars" ? selected !== undefined && point <= selected : isSelected;

          return (
            <label key={point} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                value={point}
                checked={isSelected}
                onChange={() => onChange(point)}
                aria-label={t("viewer.scale.pointLabel", { value: point, max })}
                className="peer sr-only"
              />
              {variant === "stars" ? (
                <span
                  aria-hidden="true"
                  className={`block rounded-md text-3xl leading-none transition-colors peer-focus-visible:outline-none ${focusRing} ${
                    isFilled ? "text-amber-400" : "text-slate-300 hover:text-amber-300"
                  }`}
                >
                  ★
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={`flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition-colors peer-focus-visible:outline-none ${focusRing} ${
                    isFilled
                      ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {point}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {variant === "numbers" && (minLabel || maxLabel) && (
        <div className="flex justify-between gap-4 text-xs text-slate-500">
          <span>{minLabel}</span>
          <span className="text-right">{maxLabel}</span>
        </div>
      )}

      {!required && selected !== undefined && (
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

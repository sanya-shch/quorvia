import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { QUESTION_TYPE_LABEL_KEYS } from "../../../constants";
import type { QuestionType } from "../../../types/formBuilder";
import { ADVANCED_TYPES, BASIC_TYPES, TYPE_ICONS } from "./questionTypeMeta";

interface QuestionTypePickerProps {
  onPick: (type: QuestionType) => void;
  onClose: () => void;
}

// The list of question types to add. Opened by "Add question" and by the "+" between two
// questions; it closes on Escape or a click outside, and the first type takes focus.
export default function QuestionTypePicker({ onPick, onClose }: QuestionTypePickerProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus();

    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const group = (title: string, types: QuestionType[]) => (
    <div>
      <h3 className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-1">
        {types.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onPick(type)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
          >
            <span className="text-indigo-600">{TYPE_ICONS[type]}</span>
            <span className="truncate">{t(QUESTION_TYPE_LABEL_KEYS[type])}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t("builder.editor.picker.title")}
      className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-[60vh] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
    >
      {group(t("builder.editor.picker.basic"), BASIC_TYPES)}
      {group(t("builder.editor.picker.advanced"), ADVANCED_TYPES)}
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { type QuestionConfig } from "../../../../types/formBuilder";

interface BooleanConfigEditorProps {
  config: QuestionConfig | null;
  onChange: (newConfig: QuestionConfig) => void;
}

export default function BooleanConfigEditor({ config, onChange }: BooleanConfigEditorProps) {
  const { t } = useTranslation();
  const currentConfig = config || {};
  const defaultValue = currentConfig.defaultValue ?? false;

  const handleValueChange = (value: boolean) => {
    onChange({ ...currentConfig, defaultValue: value });
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-150">
      <label className="text-xs font-semibold text-slate-500 block">
        {t("builder.editors.boolean.defaultValueLabel")}
      </label>

      <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => handleValueChange(false)}
          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            !defaultValue
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          {t("builder.editors.boolean.off")}
        </button>

        <button
          type="button"
          onClick={() => handleValueChange(true)}
          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            defaultValue
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          {t("builder.editors.boolean.on")}
        </button>
      </div>

      <div className="flex items-center gap-2 mt-2 text-slate-500 text-[11px]">
        <span>{t("builder.editors.boolean.hint")}</span>
      </div>
    </div>
  );
}

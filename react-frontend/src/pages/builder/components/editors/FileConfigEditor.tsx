import { useId } from "react";
import { useTranslation } from "react-i18next";
import { FILE_LIMITS } from "@quorvia/shared-types";
import { type QuestionConfig } from "../../../../types/formBuilder";

interface FileConfigEditorProps {
  config: QuestionConfig | null;
  onChange: (newConfig: QuestionConfig) => void;
}

const COUNTS = Array.from({ length: FILE_LIMITS.maxFilesPerQuestion }, (_, i) => i + 1);

export default function FileConfigEditor({ config, onChange }: FileConfigEditorProps) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5 motion-fade-in">
      <label htmlFor={id} className="text-xs font-semibold text-slate-500">
        {t("builder.editors.file.maxFiles")}
      </label>
      <select
        id={id}
        value={config?.maxFiles ?? 1}
        onChange={(e) => onChange({ ...config, maxFiles: Number(e.target.value) })}
        className="h-10 w-32 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {COUNTS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-500">
        {t("builder.editors.file.hint", {
          size: FILE_LIMITS.maxBytes / (1024 * 1024),
        })}
      </p>
    </div>
  );
}

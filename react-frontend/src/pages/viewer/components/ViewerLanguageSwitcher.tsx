import { useId } from "react";
import { useTranslation } from "react-i18next";
import { getLanguageName } from "../../../i18n/languageNames";

interface ViewerLanguageSwitcherProps {
  // All form languages (main + additional).
  languages: readonly string[];
  value: string;
  onChange: (language: string) => void;
}

// Form language choice for the respondent. Names are in the language itself ("Polski",
// "Українська") so people recognize theirs even when the interface is foreign.
export default function ViewerLanguageSwitcher({
  languages,
  value,
  onChange,
}: ViewerLanguageSwitcherProps) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <div className="flex items-center justify-end gap-2">
      <label htmlFor={id} className="text-xs font-semibold text-slate-500">
        {t("viewer.language.label")}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
      >
        {languages.map((language) => (
          <option key={language} value={language} lang={language}>
            {getLanguageName(language, language)}
          </option>
        ))}
      </select>
    </div>
  );
}

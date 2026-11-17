import { useId } from "react";
import { useTranslation } from "react-i18next";
import { getLanguageName } from "../../../i18n/languageNames";
import { ChevronDownIcon, GlobeIcon } from "./viewerIcons";

interface ViewerLanguageSwitcherProps {
  // All form languages (main + additional).
  languages: readonly string[];
  value: string;
  onChange: (language: string) => void;
}

// Form language choice for the respondent, a pill in the page header. Names are in the language
// itself ("Polski", "Українська") so people recognize theirs even when the interface is foreign.
// The label is only for assistive technology: the globe says what the control is.
export default function ViewerLanguageSwitcher({
  languages,
  value,
  onChange,
}: ViewerLanguageSwitcherProps) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <div className="relative flex items-center">
      <label htmlFor={id} className="sr-only">
        {t("viewer.language.label")}
      </label>
      <GlobeIcon className="pointer-events-none absolute left-3 h-4 w-4 text-slate-500" />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 cursor-pointer appearance-none rounded-xl border border-slate-200 bg-surface pl-9 pr-8 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      >
        {languages.map((language) => (
          <option key={language} value={language} lang={language}>
            {getLanguageName(language, language)}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 h-4 w-4 text-slate-500" />
    </div>
  );
}

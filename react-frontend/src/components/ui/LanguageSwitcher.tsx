import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@quorvia/shared-types";
import { changeAppLanguage } from "../../i18n";

interface LanguageSwitcherProps {
  className?: string;
}

/**
 * A simple dropdown language switch. The choice is stored in localStorage through
 * i18next-browser-languagedetector (the detector is configured to read/write exactly there, see
 * i18n/index.ts), so the next visit picks up the chosen language without auto-detecting from
 * navigator.language again.
 */
export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();

  return (
    <label className={`flex items-center gap-1.5 text-sm text-slate-500 ${className ?? ""}`}>
      <span className="sr-only">{t("language.switchLabel")}</span>
      <select
        value={i18n.resolvedLanguage}
        onChange={(e) => void changeAppLanguage(e.target.value)}
        className="cursor-pointer rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-6 text-sm text-slate-600 hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        aria-label={t("language.switchLabel")}
      >
        {SUPPORTED_LOCALES.map((locale: SupportedLocale) => (
          <option key={locale} value={locale}>
            {t(`language.${locale}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

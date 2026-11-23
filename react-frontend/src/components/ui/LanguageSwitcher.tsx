import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@quorvia/shared-types";
import { changeAppLanguage } from "../../i18n";
import AppIcon from "./AppIcon";

interface LanguageSwitcherProps {
  className?: string;
  // "lg": the larger, rounded control of the sign-in and sign-up pages.
  size?: "sm" | "lg";
}

/**
 * A simple dropdown language switch. The choice is stored in localStorage through
 * i18next-browser-languagedetector (the detector is configured to read/write exactly there, see
 * i18n/index.ts), so the next visit picks up the chosen language without auto-detecting from
 * navigator.language again.
 */
const SELECT_CLASSES = {
  sm: "rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-6 text-sm text-slate-600 hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500",
  lg: "h-11 appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-9 text-sm text-slate-900 hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500",
};

export function LanguageSwitcher({ className, size = "sm" }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();

  return (
    <label className={`flex items-center gap-1.5 text-sm text-slate-500 ${className ?? ""}`}>
      <span className="sr-only">{t("language.switchLabel")}</span>
      <select
        value={i18n.resolvedLanguage}
        onChange={(e) => void changeAppLanguage(e.target.value)}
        className={`cursor-pointer ${SELECT_CLASSES[size]}`}
        aria-label={t("language.switchLabel")}
      >
        {SUPPORTED_LOCALES.map((locale: SupportedLocale) => (
          <option key={locale} value={locale}>
            {t(`language.${locale}`)}
          </option>
        ))}
      </select>
      {/* The large select drops the browser's arrow, so it draws its own. */}
      {size === "lg" && (
        <AppIcon name="chevronDown" className="pointer-events-none -ml-8 h-4 w-4 text-slate-500" />
      )}
    </label>
  );
}

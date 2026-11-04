import { useTranslation } from "react-i18next";
import { CONTENT_LOCALES } from "@quorvia/shared-types";
import type { FormState } from "../../../types/formBuilder";
import {
  addLanguage,
  canAddLanguage,
  changeMainLanguage,
  countMissingTranslations,
  getAdditionalLanguages,
  getAvailableLanguages,
  getLanguageName,
  getMainLanguage,
} from "../translations";

interface LanguageBarProps {
  form: FormState;
  /** Мова, що зараз відкрита у вкладці (основна або одна з додаткових). */
  activeLanguage: string;
  onSelect: (language: string) => void;
  onChange: (updater: (prev: FormState) => FormState) => void;
}

const tabClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
    active ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
  }`;

const selectClass =
  "h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Мови форми: основна (мова, якою написані питання) і додаткові (переклади).
 * Вкладка додаткової мови показує, скільки полів ще не перекладено.
 */
export default function LanguageBar({ form, activeLanguage, onSelect, onChange }: LanguageBarProps) {
  const { t, i18n } = useTranslation();
  const main = getMainLanguage(form);
  const additional = getAdditionalLanguages(form);
  const name = (code: string) => getLanguageName(code, i18n.language);

  // Основною можна зробити будь-яку мову, крім уже доданих як переклад.
  const mainChoices = CONTENT_LOCALES.filter((locale) => !additional.includes(locale));

  return (
    <section
      aria-label={t("builder.languages.title")}
      className="mb-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div
          role="group"
          aria-label={t("builder.languages.tabsLabel")}
          className="flex flex-wrap items-center gap-1 bg-slate-50 p-0.5 rounded-xl border border-slate-200"
        >
          <button
            type="button"
            aria-pressed={activeLanguage === main}
            onClick={() => onSelect(main)}
            className={tabClass(activeLanguage === main)}
          >
            {name(main)}
            <span className="text-[10px] font-medium opacity-70">
              {t("builder.languages.mainBadge")}
            </span>
          </button>

          {additional.map((language) => {
            const missing = countMissingTranslations(form, language);

            return (
              <button
                key={language}
                type="button"
                aria-pressed={activeLanguage === language}
                onClick={() => onSelect(language)}
                className={tabClass(activeLanguage === language)}
              >
                {name(language)}
                {missing > 0 && (
                  <span
                    aria-label={t("builder.languages.missingCount", { count: missing })}
                    className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700"
                  >
                    {missing}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <select
          aria-label={t("builder.languages.add")}
          value=""
          disabled={!canAddLanguage(form)}
          title={canAddLanguage(form) ? undefined : t("builder.languages.maxReached")}
          onChange={(e) => {
            const language = e.target.value;
            if (!language) return;

            onChange((prev) => addLanguage(prev, language));
            onSelect(language);
          }}
          className={selectClass}
        >
          <option value="">{t("builder.languages.addPlaceholder")}</option>
          {getAvailableLanguages(form).map((locale) => (
            <option key={locale} value={locale}>
              {name(locale)}
            </option>
          ))}
        </select>

        <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-500">
          {t("builder.languages.mainLabel")}
          <select
            value={main}
            onChange={(e) => {
              onChange((prev) => changeMainLanguage(prev, e.target.value));
              onSelect(e.target.value);
            }}
            className={selectClass}
          >
            {mainChoices.map((locale) => (
              <option key={locale} value={locale}>
                {name(locale)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">{t("builder.languages.mainHint")}</p>
    </section>
  );
}

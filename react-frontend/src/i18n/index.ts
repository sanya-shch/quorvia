import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@quorvia/shared-types";

import enCommon from "./locales/en/common.json";
import enErrors from "./locales/en/errors.json";
import enConditionErrors from "./locales/en/conditionErrors.json";
import enAuth from "./locales/en/auth.json";
import enDashboard from "./locales/en/dashboard.json";
import enBuilder from "./locales/en/builder.json";
import enViewer from "./locales/en/viewer.json";
import enAnalytics from "./locales/en/analytics.json";

import ukCommon from "./locales/uk/common.json";
import ukErrors from "./locales/uk/errors.json";
import ukConditionErrors from "./locales/uk/conditionErrors.json";
import ukAuth from "./locales/uk/auth.json";
import ukDashboard from "./locales/uk/dashboard.json";
import ukBuilder from "./locales/uk/builder.json";
import ukViewer from "./locales/uk/viewer.json";
import ukAnalytics from "./locales/uk/analytics.json";

export const I18N_LOCALSTORAGE_KEY = "quorvia-language";

/**
 * Кожна фіча-область (auth, dashboard, builder, viewer, analytics) - свій
 * JSON-файл per locale, для зручності рев'ю, але всі вони зливаються в
 * ОДИН неймспейс i18next ("common") - тримати десяток неймспейсів заради
 * проєкту такого розміру було б зайвою складністю.
 */
const en = {
  ...enCommon,
  errors: enErrors,
  conditionErrors: enConditionErrors,
  auth: enAuth,
  dashboard: enDashboard,
  builder: enBuilder,
  viewer: enViewer,
  analytics: enAnalytics,
};

const uk = {
  ...ukCommon,
  errors: ukErrors,
  conditionErrors: ukConditionErrors,
  auth: ukAuth,
  dashboard: ukDashboard,
  builder: ukBuilder,
  viewer: ukViewer,
  analytics: ukAnalytics,
};

/**
 * Порядок визначення мови: спершу explicit-вибір користувача (localStorage,
 * записується автоматично при зміні мови через LanguageSwitcher), інакше -
 * мова браузера. `supportedLngs` + `fallbackLng` разом гарантують: якщо
 * navigator.language не "uk" і не "en" (напр. "fr", "de-DE") - беремо
 * англійську, а не залишаємо i18next вгадувати найближчий варіант.
 */
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
      uk: { common: uk },
    },
    ns: ["common"],
    defaultNS: "common",
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: DEFAULT_LOCALE,
    load: "languageOnly", // "uk-UA" -> "uk", "en-US" -> "en"
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: I18N_LOCALSTORAGE_KEY,
    },
  });

export default i18n;

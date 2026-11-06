import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from "@quorvia/shared-types";

export const I18N_LOCALSTORAGE_KEY = "quorvia-language";

type Bundle = Record<string, unknown>;

// Only the active language is downloaded; the other one is fetched on demand
// (language switch, or a public form whose UI language differs from the app's).
const bundleLoaders: Record<SupportedLocale, () => Promise<{ default: Bundle }>> = {
  en: () => import("./locales/en"),
  uk: () => import("./locales/uk"),
};

const bundles = new Map<string, Bundle>();
const pendingLoads = new Map<string, Promise<void>>();

const isSupportedLocale = (language: string): language is SupportedLocale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(language);

export const isLocaleLoaded = (language: string): boolean => bundles.has(language);

export const loadLocale = (language: string): Promise<void> => {
  if (!isSupportedLocale(language) || bundles.has(language)) return Promise.resolve();

  let pending = pendingLoads.get(language);

  if (!pending) {
    pending = bundleLoaders[language]()
      .then((module) => {
        bundles.set(language, module.default);
        i18n.addResourceBundle(language, "common", module.default, true, true);
      })
      .finally(() => pendingLoads.delete(language));
    pendingLoads.set(language, pending);
  }

  return pending;
};

export const loadAllLocales = (): Promise<void[]> =>
  Promise.all(SUPPORTED_LOCALES.map((language) => loadLocale(language)));

// Loads the language bundle first so the UI never renders raw keys, then switches.
export const changeAppLanguage = async (language: string): Promise<void> => {
  await loadLocale(language);
  await i18n.changeLanguage(language);
};

/**
 * Language resolution order: first the user's explicit choice (localStorage, written
 * automatically when the language changes through LanguageSwitcher), otherwise the browser
 * language. `supportedLngs` + `fallbackLng` together guarantee that if navigator.language is
 * neither "uk" nor "en" (for example "fr", "de-DE") we take English instead of letting i18next
 * guess the nearest variant.
 */
const baseOptions = {
  ns: ["common"],
  defaultNS: "common",
  supportedLngs: [...SUPPORTED_LOCALES],
  fallbackLng: DEFAULT_LOCALE,
  load: "languageOnly" as const, // "uk-UA" -> "uk", "en-US" -> "en"
  interpolation: { escapeValue: false },
};

// Resolves once the detected language bundle is in place; main.tsx waits for it before the first render.
export const i18nReady: Promise<void> = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    ...baseOptions,
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: I18N_LOCALSTORAGE_KEY,
    },
  })
  .then(async () => {
    const detected = i18n.language?.split("-")[0] ?? DEFAULT_LOCALE;

    await loadLocale(isSupportedLocale(detected) ? detected : DEFAULT_LOCALE);
    // Re-resolve now that resources exist (sets resolvedLanguage, notifies subscribers).
    await i18n.changeLanguage(i18n.language);
  });

/**
 * A separate i18n instance with a fixed language (for the public form, which is shown in the
 * form's language, not the app's). It is created WITHOUT a language detector: a clone of the main
 * instance (cloneInstance) shares its detector and would write the respondent's choice to
 * localStorage as the app language. The needed bundles must be loaded beforehand (loadLocale);
 * initialization is then synchronous.
 */
export const createIsolatedI18n = (language: string) => {
  const instance = i18n.createInstance();

  const resources = Object.fromEntries(
    [...bundles].map(([locale, bundle]) => [locale, { common: bundle }]),
  );

  void instance.init({ ...baseOptions, resources, lng: language, initAsync: false });

  return instance;
};

export default i18n;

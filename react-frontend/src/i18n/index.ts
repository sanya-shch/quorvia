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

/** Loads the language bundle first so the UI never renders raw keys, then switches. */
export const changeAppLanguage = async (language: string): Promise<void> => {
  await loadLocale(language);
  await i18n.changeLanguage(language);
};

/**
 * Порядок визначення мови: спершу explicit-вибір користувача (localStorage,
 * записується автоматично при зміні мови через LanguageSwitcher), інакше -
 * мова браузера. `supportedLngs` + `fallbackLng` разом гарантують: якщо
 * navigator.language не "uk" і не "en" (напр. "fr", "de-DE") - беремо
 * англійську, а не залишаємо i18next вгадувати найближчий варіант.
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
 * Окремий екземпляр i18n з фіксованою мовою (для публічної форми, яка
 * показується мовою форми, а не мовою застосунку). Створюється БЕЗ детектора
 * мови: клон основного екземпляра (cloneInstance) ділить з ним детектор і
 * записував би вибір респондента в localStorage як мову застосунку.
 * Потрібні бандли мають бути завантажені заздалегідь (loadLocale), тоді ініціалізація синхронна.
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

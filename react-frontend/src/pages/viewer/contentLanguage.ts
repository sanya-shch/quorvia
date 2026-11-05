import { DEFAULT_CONTENT_LANGUAGE, DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@quorvia/shared-types";

/** Мови, які просить респондент: явний ?lang=, потім налаштування браузера (за пріоритетом). */
export const getRequestedLanguages = (
  search: string,
  browserLanguages: readonly string[],
): string[] => {
  const explicit = new URLSearchParams(search).get("lang");

  return [...(explicit ? [explicit] : []), ...browserLanguages];
};

/** Мови браузера; порожній список, якщо їх не вдалося визначити (SSR, старі браузери). */
export const readBrowserLanguages = (): string[] => {
  if (typeof navigator === "undefined") return [];

  return navigator.languages?.length ? [...navigator.languages] : navigator.language ? [navigator.language] : [];
};

/**
 * Мова службових текстів (кнопки, помилки) для форми, показаної мовою
 * `contentLanguage`: та сама, якщо інтерфейс її має (uk/en), інакше англійська.
 */
export const getUiLanguageFor = (contentLanguage: string): string =>
  (SUPPORTED_LOCALES as readonly string[]).includes(contentLanguage)
    ? contentLanguage
    : DEFAULT_LOCALE;

/** Основна мова форми з урахуванням відповіді старого сервера (без поля). */
export const getMainLanguage = (defaultLanguage: string | undefined): string =>
  defaultLanguage ?? DEFAULT_CONTENT_LANGUAGE;

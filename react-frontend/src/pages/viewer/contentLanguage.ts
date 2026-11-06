import { DEFAULT_CONTENT_LANGUAGE, DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@quorvia/shared-types";

// Languages the respondent asks for: an explicit ?lang=, then the browser settings (by priority).
export const getRequestedLanguages = (
  search: string,
  browserLanguages: readonly string[],
): string[] => {
  const explicit = new URLSearchParams(search).get("lang");

  return [...(explicit ? [explicit] : []), ...browserLanguages];
};

// Browser languages; an empty list if they cannot be determined (SSR, old browsers).
export const readBrowserLanguages = (): string[] => {
  if (typeof navigator === "undefined") return [];

  return navigator.languages?.length ? [...navigator.languages] : navigator.language ? [navigator.language] : [];
};

// Language of service texts (buttons, errors) for a form shown in `contentLanguage`: the same
// one if the interface has it (uk/en), otherwise English.
export const getUiLanguageFor = (contentLanguage: string): string =>
  (SUPPORTED_LOCALES as readonly string[]).includes(contentLanguage)
    ? contentLanguage
    : DEFAULT_LOCALE;

// The form's main language, taking an old server's response (without the field) into account.
export const getMainLanguage = (defaultLanguage: string | undefined): string =>
  defaultLanguage ?? DEFAULT_CONTENT_LANGUAGE;

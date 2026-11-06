import { createI18n } from "vue-i18n";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from "@quorvia/shared-types";
import en from "./locales/en.json";
import uk from "./locales/uk.json";

const isSupportedLocale = (value: string | undefined): value is SupportedLocale =>
  !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);

/**
 * The module is loaded through Module Federation into the React host's separate JS context, so it
 * cannot share one i18next instance with react-frontend: it has its own vue-i18n with the same two
 * languages and the same fallback rule (SUPPORTED_LOCALES/DEFAULT_LOCALE are shared constants from
 * @quorvia/shared-types so the language set does not drift between packages).
 *
 * legacy: false is the Composition API mode, needed so `locale` is a reactive ref that can be
 * changed on the fly (see AnalyticsApp.vue) when the React host passes a new `locale` prop after
 * the user switches the language.
 */
export const createAnalyticsI18n = (initialLocale?: string) =>
  createI18n({
    legacy: false,
    locale: isSupportedLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE,
    fallbackLocale: DEFAULT_LOCALE,
    messages: { en, uk },
  });

// A default export is needed for Module Federation: @originjs/vite-plugin-federation wraps a remote
// module WITHOUT a default export into { default: module }, and the host does not see the named
// createAnalyticsI18n on the namespace itself. With a default export the module is returned as is
// (both the named and the default one are available).
export default { createAnalyticsI18n };

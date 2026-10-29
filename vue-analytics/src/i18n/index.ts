import { createI18n } from "vue-i18n";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from "@quorvia/shared-types";
import en from "./locales/en.json";
import uk from "./locales/uk.json";

const isSupportedLocale = (value: string | undefined): value is SupportedLocale =>
  !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);

/**
 * Модуль підвантажується через Module Federation в окремий JS-контекст
 * React-хоста, тому не може ділити один i18next-інстанс з react-frontend -
 * має власний vue-i18n, з тими самими двома мовами й тим самим правилом
 * фолбеку (SUPPORTED_LOCALES/DEFAULT_LOCALE - спільні константи з
 * @quorvia/shared-types, щоб набір мов не розійшовся між пакетами).
 *
 * legacy: false - Composition API режим, потрібен щоб `locale` був
 * реактивним ref, який можна міняти "на льоту" (див. AnalyticsApp.vue),
 * коли React-хост передає нове значення пропа `locale` після перемикання
 * мови користувачем.
 */
export const createAnalyticsI18n = (initialLocale?: string) =>
  createI18n({
    legacy: false,
    locale: isSupportedLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE,
    fallbackLocale: DEFAULT_LOCALE,
    messages: { en, uk },
  });

// Default-експорт потрібен для Module Federation: @originjs/vite-plugin-federation
// обгортає remote-модуль БЕЗ default-експорту в { default: модуль }, і хост
// не бачить іменований createAnalyticsI18n на самому namespace. З default-
// експортом модуль віддається як є (і іменований, і default доступні).
export default { createAnalyticsI18n };

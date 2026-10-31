import { useEffect, useRef } from "react";
import { createApp, reactive, type App } from "vue";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../store/useAuthStore";
import { refreshAccessToken } from "../../../api/axios";

interface VueAnalyticsHostProps {
  formId: string;
}

export default function VueAnalyticsHost({ formId }: VueAnalyticsHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<App | null>(null);
  const token = useAuthStore((s) => s.token);
  const { i18n } = useTranslation();

  /**
   * reactive() - живе довше за один змонтований Vue-застосунок (той самий
   * об'єкт переживає formId-ремаунти нижче). Завдяки цьому мутація
   * vueProps.current.locale примушує ЖИВИЙ AnalyticsApp.vue перерендеритись
   * з новою мовою одразу, без розмонтування Vue-піддерева - інакше зміна
   * мови під час перегляду аналітики скидала б активну вкладку/вибрану
   * відповідь.
   */
  const vueProps = useRef(
    reactive({
      formId,
      apiBaseUrl: import.meta.env.VITE_API_URL || "http://localhost:5001/api",
      locale: i18n.language,
      // Явний міст автентифікації для Vue-remote: токен лише в пам'яті
      // хоста (не в localStorage), тож remote бере його через ці функції.
      // refreshAccessToken ділить один /auth/refresh із React-запитами.
      getAccessToken: () => useAuthStore.getState().token,
      refreshAccessToken,
    }),
  );

  useEffect(() => {
    vueProps.current.locale = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    let cancelled = false;
    vueProps.current.formId = formId;

    (async () => {
      const [mod, i18nMod] = await Promise.all([
        import("vue_analytics/AnalyticsApp"),
        import("vue_analytics/i18n"),
      ]);
      if (cancelled || !containerRef.current) return;

      const app = createApp(mod.default, vueProps.current);
      // Федерація може віддати модуль як { createAnalyticsI18n } або обгорнутим
      // у { default: { createAnalyticsI18n } } (див. vue-analytics/src/i18n).
      const { createAnalyticsI18n } = (
        "createAnalyticsI18n" in i18nMod ? i18nMod : (i18nMod as { default: typeof i18nMod }).default
      ) as typeof i18nMod;
      app.use(createAnalyticsI18n(vueProps.current.locale));
      app.mount(containerRef.current);
      appRef.current = app;
    })().catch((err) => {
      console.error("Не вдалося завантажити vue-analytics remote:", err);
    });

    return () => {
      cancelled = true;
      appRef.current?.unmount();
      appRef.current = null;
    };
  }, [formId]);

  if (!token) return null;

  return <div ref={containerRef} />;
}

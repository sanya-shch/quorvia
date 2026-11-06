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
   * reactive() outlives a single mounted Vue app (the same object survives the formId remounts
   * below). That is why mutating vueProps.current.locale makes the LIVE AnalyticsApp.vue re-render
   * with the new language immediately, without unmounting the Vue subtree; otherwise changing the
   * language while viewing analytics would reset the active tab/selected response.
   */
  const vueProps = useRef(
    reactive({
      formId,
      apiBaseUrl: import.meta.env.VITE_API_URL || "http://localhost:5001/api",
      locale: i18n.language,
      // Explicit auth bridge for the Vue remote: the token lives only in the host's memory (not
      // localStorage), so the remote gets it through these functions. refreshAccessToken shares one
      // /auth/refresh with React requests.
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
      // Federation may return the module as { createAnalyticsI18n } or wrapped in
      // { default: { createAnalyticsI18n } } (see vue-analytics/src/i18n).
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

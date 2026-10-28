import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import federation from "@originjs/vite-plugin-federation";

const originOf = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

/**
 * Content-Security-Policy для PRODUCTION-збірки (у dev не додається:
 * Vite HMR потребує inline-скриптів і WebSocket).
 *
 * Чому це важливо саме тут: Vue-аналітика підвантажується як federated
 * remote ЗІ ІНШОГО origin і виконується в контексті React-сторінки. Без
 * CSP компрометація того хостингу = довільний JS на сторінці з сесією
 * користувача. З CSP скрипти дозволені лише з власного origin і з
 * ЯВНО вказаного origin remote (VITE_VUE_ANALYTICS_URL), а запити -
 * лише до API.
 *
 * <meta> не підтримує frame-ancestors/report-uri: для них (та для повного
 * захисту) віддавайте CSP заголовком HTTP з хостингу - див. README.
 * Вимкнути: VITE_DISABLE_CSP=true.
 */
const cspPlugin = (env: Record<string, string>): Plugin => ({
  name: "inject-csp",
  apply: "build",
  transformIndexHtml(html) {
    if (env.VITE_DISABLE_CSP === "true") return html;

    const remote = originOf(env.VITE_VUE_ANALYTICS_URL || "http://localhost:5174");
    const api = originOf(env.VITE_API_URL || "http://localhost:5001/api");

    const policy = [
      "default-src 'self'",
      `script-src 'self' ${remote}`,
      // 'unsafe-inline' для стилів: Tailwind/Vue-remote інжектять <style>.
      `style-src 'self' 'unsafe-inline' ${remote}`,
      `connect-src 'self' ${api} ${remote}`,
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return html.replace(
      "<head>",
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    );
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      tailwindcss(),
      cspPlugin(env),
      federation({
        name: "host",
        remotes: {
          vue_analytics: `${env.VITE_VUE_ANALYTICS_URL || "http://localhost:5174"}/assets/remoteEntry.js`,
        },
        shared: ["vue"],
      }),
    ],
    build: {
      target: "esnext",
    },
  };
});

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
 * Content-Security-Policy for the PRODUCTION build (not added in dev: Vite HMR needs
 * inline scripts and a WebSocket).
 *
 * Why it matters here: the Vue analytics is loaded as a federated remote FROM ANOTHER
 * origin and runs in the context of the React page. Without a CSP, compromising that
 * host means arbitrary JS on a page that holds the user's session. With it, scripts are
 * allowed only from our own origin and from the EXPLICITLY configured remote origin
 * (VITE_VUE_ANALYTICS_URL), and requests only to the API.
 *
 * <meta> does not support frame-ancestors/report-uri: for those (and for full protection)
 * serve the CSP as an HTTP header from the hosting, see docs/security.md.
 * Disable with VITE_DISABLE_CSP=true.
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
      // 'unsafe-inline' for styles: Tailwind/the Vue remote inject <style>.
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

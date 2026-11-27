import { createHash } from "node:crypto";

/**
 * CSP source expressions ('sha256-...') for the inline <script>s of an HTML page.
 *
 * The production CSP allows scripts only from our own origin and the analytics remote, so the
 * small inline script of index.html (it sets the theme before the first paint) would be blocked.
 * Allowing it by its hash keeps 'unsafe-inline' out of script-src: only this exact text may run.
 * Used by the CSP plugin in vite.config.ts at build time (hence node:crypto), tested in csp.test.ts.
 */
export const inlineScriptHashes = (html: string): string[] =>
  [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .filter((match) => match[1].trim() !== "")
    .map((match) => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);

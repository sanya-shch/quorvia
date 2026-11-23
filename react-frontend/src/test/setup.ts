import "@testing-library/jest-dom/vitest";
import { beforeAll } from "vitest";
import { configure } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import i18n, { i18nReady, loadAllLocales } from "../i18n";

// findBy*/waitFor wait 1 s by default. A full parallel run loads the machine enough that a lazy chunk
// or a slow first render exceeds it; a longer ceiling costs nothing when the element appears sooner.
configure({ asyncUtilTimeout: 5000 });

// Tests check the final DOM state, not smoothness: animations finish instantly.
MotionGlobalConfig.skipAnimations = true;

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Tests check specific visible text, so the language is set explicitly instead of depending on the
// navigator.language of the environment vitest runs in (jsdom returns "en-US" by default, while
// the existing tests expect Ukrainian button labels).
beforeAll(async () => {
  await i18nReady;
  await loadAllLocales();
  await i18n.changeLanguage("uk");
});

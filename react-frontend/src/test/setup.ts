import "@testing-library/jest-dom/vitest";
import { beforeAll } from "vitest";
import { MotionGlobalConfig } from "motion/react";
import i18n, { i18nReady, loadAllLocales } from "../i18n";

// Тести перевіряють підсумковий стан DOM, а не плавність: анімації завершуються миттєво.
MotionGlobalConfig.skipAnimations = true;

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Тести перевіряють конкретний видимий текст - фіксуємо мову явно, щоб не залежати від navigator.language середовища,
// в якому запускається vitest (jsdom за замовчуванням віддає "en-US", а наявні тести очікують українські підписи кнопок).
beforeAll(async () => {
  await i18nReady;
  await loadAllLocales();
  await i18n.changeLanguage("uk");
});

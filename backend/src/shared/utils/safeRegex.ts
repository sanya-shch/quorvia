import RE2 from "re2";

/**
 * Користувацькі регулярки (TextQuestion.config.pattern) виконуються НА
 * СЕРВЕРІ над даними анонімних респондентів. Звичайний RegExp у V8 має
 * backtracking, тож шаблон на кшталт `(a+)+$` на рядку з ~30 символів
 * блокує event loop на секунди/хвилини - і це зупиняє весь API, а не лише
 * одну форму. Будь-який зареєстрований користувач може створити таку
 * форму й сам же її "відправити" (ReDoS).
 *
 * RE2 гарантує лінійний час виконання незалежно від шаблону. Ціна -
 * RE2 не підтримує lookahead/lookbehind та зворотні посилання (\1); такі
 * шаблони відхиляються ще при збереженні форми (form.schema.ts).
 */
export const MAX_PATTERN_LENGTH = 200;

export const compileSafePattern = (pattern: string): RE2 | null => {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return null;
  }

  try {
    return new RE2(pattern);
  } catch {
    return null;
  }
};

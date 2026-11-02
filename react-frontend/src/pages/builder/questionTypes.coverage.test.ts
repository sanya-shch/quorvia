import { describe, expect, it } from "vitest";
import { QUESTION_TYPES } from "@quorvia/shared-types";
import i18n from "../../i18n";
import { QUESTION_TYPE_LABEL_KEYS } from "../../constants";
import { getSidebarItems } from "./constants";

/**
 * Сторож повноти: TypeScript не бачить, що для нового типу питання забули
 * пункт у палітрі конструктора або переклад у uk/en. Цей тест пробігає
 * весь QUESTION_TYPES зі shared-types і падає, якщо щось пропущено.
 */
describe("покриття типів питань у конструкторі", () => {
  const t = i18n.t.bind(i18n) as never;

  it("кожен тип має ключ підпису", () => {
    for (const type of QUESTION_TYPES) {
      expect(QUESTION_TYPE_LABEL_KEYS[type], type).toBeTruthy();
    }
  });

  it("кожен тип є в палітрі конструктора рівно один раз", () => {
    const paletteTypes = getSidebarItems(t).map((item) => item.type);

    expect([...paletteTypes].sort()).toEqual([...QUESTION_TYPES].sort());
  });

  it.each(["uk", "en"])("кожен тип має переклад підпису (%s)", (lng) => {
    for (const type of QUESTION_TYPES) {
      const key = QUESTION_TYPE_LABEL_KEYS[type];

      expect(i18n.exists(key, { lng }), `${lng}: ${key}`).toBe(true);
    }
  });
});

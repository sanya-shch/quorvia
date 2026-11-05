import { describe, expect, it } from "vitest";
import i18n, { createIsolatedI18n, I18N_LOCALSTORAGE_KEY } from "./index";

describe("createIsolatedI18n", () => {
  it("працює синхронно й віддає тексти потрібної мови", () => {
    expect(createIsolatedI18n("en").t("viewer.loading")).toBe("Loading survey...");
    expect(createIsolatedI18n("uk").t("viewer.loading")).toBe("Завантаження опитування...");
  });

  it("не змінює мову застосунку й не пише в localStorage (на відміну від cloneInstance)", () => {
    localStorage.setItem(I18N_LOCALSTORAGE_KEY, "uk");
    const appLanguage = i18n.language;

    createIsolatedI18n("en");

    expect(i18n.language).toBe(appLanguage);
    expect(localStorage.getItem(I18N_LOCALSTORAGE_KEY)).toBe("uk");
  });

  it("невідома мова падає на англійську", () => {
    expect(createIsolatedI18n("pl").t("viewer.loading")).toBe("Loading survey...");
  });

  it("підтримує підстановки ({{count}})", () => {
    expect(createIsolatedI18n("en").t("builder.languages.missingCount", { count: 3 })).toBe(
      "Not translated: 3",
    );
  });
});

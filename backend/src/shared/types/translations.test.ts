import { describe, expect, it } from "vitest";
import {
  isContentLocale,
  localizeForm,
  localizeQuestion,
  normalizeFormTranslations,
  normalizeQuestionTranslations,
  pickContentLanguage,
  toPrimaryLanguage,
  type QuestionConfig,
} from "@quorvia/shared-types";

describe("toPrimaryLanguage", () => {
  it("відкидає регіон і регістр", () => {
    expect(toPrimaryLanguage("en-US")).toBe("en");
    expect(toPrimaryLanguage("UK")).toBe("uk");
    expect(toPrimaryLanguage("zh-Hans-CN")).toBe("zh");
  });

  it("норвезькі варіанти зводяться до nb", () => {
    expect(toPrimaryLanguage("no")).toBe("nb");
    expect(toPrimaryLanguage("nn-NO")).toBe("nb");
    expect(toPrimaryLanguage("nb")).toBe("nb");
  });

  it("не схоже на код мови - null", () => {
    expect(toPrimaryLanguage("")).toBeNull();
    expect(toPrimaryLanguage("123")).toBeNull();
    expect(toPrimaryLanguage("-")).toBeNull();
  });
});

describe("pickContentLanguage", () => {
  const available = ["uk", "en", "pl"];

  it("бере першу доступну з побажань", () => {
    expect(pickContentLanguage(["de", "pl-PL", "en"], available, "uk")).toBe("pl");
  });

  it("регіональний варіант підходить до базової мови", () => {
    expect(pickContentLanguage(["en-GB"], available, "uk")).toBe("en");
  });

  it("порожні й некоректні побажання пропускаються, потім - основна мова", () => {
    expect(pickContentLanguage([null, undefined, "", "??", "fr"], available, "uk")).toBe("uk");
    expect(pickContentLanguage([], available, "uk")).toBe("uk");
  });
});

describe("isContentLocale", () => {
  it("лише коди зі списку", () => {
    expect(isContentLocale("en")).toBe(true);
    expect(isContentLocale("en-US")).toBe(false);
    // RTL-мови свідомо не підтримуються
    expect(isContentLocale("ar")).toBe(false);
    expect(isContentLocale(5)).toBe(false);
  });
});

describe("localizeQuestion", () => {
  const question = {
    text: "Оцініть",
    description: "Опис",
    options: [
      { id: "a", text: "Так" },
      { id: "b", text: "Ні" },
    ],
    config: { minLabel: "Погано", maxLabel: "Чудово", rows: [{ id: "r1", text: "Швидкість" }] } as QuestionConfig,
    translations: {
      en: {
        text: "Rate us",
        options: { a: "Yes" },
        rows: { r1: "Speed" },
        minLabel: "Bad",
      },
    },
  };

  it("підставляє переклад тексту, варіантів, рядків і підписів", () => {
    const result = localizeQuestion(question, "en");

    expect(result.text).toBe("Rate us");
    expect(result.options?.map((o) => o.text)).toEqual(["Yes", "Ні"]);
    expect(result.config?.rows?.[0].text).toBe("Speed");
    expect(result.config?.minLabel).toBe("Bad");
  });

  it("поле без перекладу лишається основною мовою, а не порожнім", () => {
    const result = localizeQuestion(question, "en");

    expect(result.description).toBe("Опис");
    expect(result.config?.maxLabel).toBe("Чудово");
    expect(result.options?.[1].text).toBe("Ні");
  });

  it("порожній (пробіли) переклад вважається відсутнім", () => {
    const result = localizeQuestion(
      { ...question, translations: { en: { text: "   ", options: { a: "" } } } },
      "en",
    );

    expect(result.text).toBe("Оцініть");
    expect(result.options?.[0].text).toBe("Так");
  });

  it("мова без перекладу повертає те саме питання; id варіантів незмінні", () => {
    expect(localizeQuestion(question, "pl")).toBe(question);
    expect(localizeQuestion(question, "en").options?.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("не змінює вхідний об'єкт", () => {
    const snapshot = JSON.stringify(question);

    localizeQuestion(question, "en");

    expect(JSON.stringify(question)).toBe(snapshot);
  });

  it("питання без options/config не ламається", () => {
    const result = localizeQuestion(
      { text: "Q", description: null, options: null, config: null, translations: { en: { text: "T" } } },
      "en",
    );

    expect(result).toMatchObject({ text: "T", options: null, config: null });
  });
});

describe("localizeForm", () => {
  const form = {
    title: "Опитування",
    description: "Опис",
    translations: { en: { title: "Survey" } },
  };

  it("перекладає title, а description лишається основним, якщо перекладу немає", () => {
    expect(localizeForm(form, "en")).toMatchObject({ title: "Survey", description: "Опис" });
  });

  it("мова без перекладу - та сама форма", () => {
    expect(localizeForm(form, "pl")).toBe(form);
  });
});

describe("normalizeFormTranslations", () => {
  it("лишає лише мови зі списку й непорожні title/description", () => {
    expect(
      normalizeFormTranslations(
        {
          en: { title: "Survey", description: "  ", extra: "x" },
          pl: { title: "Ankieta" },
          de: { title: "Umfrage" },
        },
        ["en", "pl"],
      ),
    ).toEqual({ en: { title: "Survey" }, pl: { title: "Ankieta" } });
  });

  it("порожнє, не об'єкт або без валідних мов - null", () => {
    expect(normalizeFormTranslations(null, ["en"])).toBeNull();
    expect(normalizeFormTranslations("x", ["en"])).toBeNull();
    expect(normalizeFormTranslations({ en: { title: "" } }, ["en"])).toBeNull();
    expect(normalizeFormTranslations({ en: { title: "S" } }, [])).toBeNull();
  });
});

describe("normalizeQuestionTranslations", () => {
  const question = {
    options: [{ id: "a" }, { id: "b" }],
    config: { rows: [{ id: "r1" }] },
  };

  it("прибирає переклади варіантів і рядків, яких уже немає в питанні", () => {
    expect(
      normalizeQuestionTranslations(
        {
          en: {
            text: "T",
            options: { a: "A", gone: "G" },
            rows: { r1: "R", ghost: "X" },
          },
        },
        ["en"],
        question,
      ),
    ).toEqual({ en: { text: "T", options: { a: "A" }, rows: { r1: "R" } } });
  });

  it("прибирає мови, яких немає у списку, і порожні значення", () => {
    expect(
      normalizeQuestionTranslations(
        { en: { text: "T", description: "" }, de: { text: "D" } },
        ["en"],
        question,
      ),
    ).toEqual({ en: { text: "T" } });
  });

  it("записи, що стали порожніми, не лишаються; без нічого - null", () => {
    expect(
      normalizeQuestionTranslations({ en: { options: { gone: "G" } } }, ["en"], question),
    ).toBeNull();
    expect(normalizeQuestionTranslations(undefined, ["en"], question)).toBeNull();
  });

  it("питання без options/config (TEXT) не падає", () => {
    expect(
      normalizeQuestionTranslations({ en: { text: "T", options: { a: "A" } } }, ["en"], {}),
    ).toEqual({ en: { text: "T" } });
  });

  it("зберігає підписи країв шкали", () => {
    expect(
      normalizeQuestionTranslations({ en: { minLabel: "Bad", maxLabel: "Good" } }, ["en"], {}),
    ).toEqual({ en: { minLabel: "Bad", maxLabel: "Good" } });
  });
});

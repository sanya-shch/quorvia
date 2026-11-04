import { describe, expect, it } from "vitest";
import {
  addLanguage,
  canAddLanguage,
  changeMainLanguage,
  copyMissingFromMain,
  countMissingTranslations,
  getAvailableLanguages,
  getLanguageName,
  listTranslationFields,
  removeLanguage,
  setFieldTranslation,
} from "./translations";
import type { FormState, Question } from "../../types/formBuilder";

const question = (overrides: Partial<Question>): Question => ({
  id: "q",
  type: "TEXT",
  text: "Питання",
  required: false,
  order: 0,
  options: [],
  config: null,
  ...overrides,
});

const baseForm = (overrides: Partial<FormState> = {}): FormState => ({
  title: "Опитування",
  description: "Опис форми",
  responseMode: "ALL_AT_ONCE",
  defaultLanguage: "uk",
  languages: ["en"],
  translations: null,
  questions: [
    question({
      id: "c",
      type: "CHOICE_SINGLE",
      text: "Напій",
      options: [
        { id: "o1", text: "Кава", isDefault: false },
        { id: "o2", text: "Чай", isDefault: false },
      ],
    }),
  ],
  ...overrides,
});

describe("listTranslationFields", () => {
  it("форма + питання + варіанти; порожні основні тексти пропускаються", () => {
    const form = baseForm({ description: "" });

    expect(listTranslationFields(form, "en").map((f) => f.key)).toEqual([
      "form:title",
      "q:0:text",
      "q:0:option:o1",
      "q:0:option:o2",
    ]);
  });

  it("для матриці - рядки й колонки; для шкали - підписи країв лише якщо вони задані", () => {
    const form = baseForm({
      questions: [
        question({
          id: "m",
          type: "MATRIX",
          text: "Оцініть",
          options: [{ id: "a", text: "Згоден", isDefault: false }],
          config: { rows: [{ id: "r1", text: "Швидкість" }] },
        }),
        question({
          id: "s",
          type: "SCALE",
          text: "Шкала",
          config: { min: 1, max: 5, minLabel: "Погано" },
        }),
      ],
    });
    const keys = listTranslationFields(form, "en").map((f) => f.key);

    expect(keys).toContain("q:0:option:a");
    expect(keys).toContain("q:0:row:r1");
    expect(keys).toContain("q:1:minLabel");
    expect(keys).not.toContain("q:1:maxLabel");
  });

  it("показує наявні переклади", () => {
    const form = baseForm({
      translations: { en: { title: "Survey" } },
      questions: [
        question({
          id: "c",
          type: "CHOICE_SINGLE",
          text: "Напій",
          options: [{ id: "o1", text: "Кава", isDefault: false }],
          translations: { en: { text: "Drink", options: { o1: "Coffee" } } },
        }),
      ],
    });
    const byKey = Object.fromEntries(listTranslationFields(form, "en").map((f) => [f.key, f.value]));

    expect(byKey).toMatchObject({
      "form:title": "Survey",
      "q:0:text": "Drink",
      "q:0:option:o1": "Coffee",
      "form:description": "",
    });
  });

  it("питання без варіантів у типі (TEXT) не отримують полів варіантів, навіть якщо options не порожній", () => {
    const form = baseForm({
      questions: [question({ type: "TEXT", options: [{ id: "x", text: "Stale", isDefault: false }] })],
    });

    expect(listTranslationFields(form, "en").some((f) => f.kind === "option")).toBe(false);
  });
});

describe("countMissingTranslations", () => {
  it("рахує поля без перекладу; пробіли = немає перекладу", () => {
    const form = baseForm({ translations: { en: { title: "Survey", description: "   " } } });

    // title є; description (пробіли), питання та 2 варіанти - немає
    expect(countMissingTranslations(form, "en")).toBe(4);
  });

  it("мова без жодного перекладу - усі поля відсутні", () => {
    expect(countMissingTranslations(baseForm(), "pl")).toBe(5);
  });
});

describe("setFieldTranslation", () => {
  const field = (kind: never, questionIndex: number | null, refId: string | null = null) => ({
    kind,
    questionIndex,
    refId,
  });

  it("записує переклад заголовка форми", () => {
    const next = setFieldTranslation(baseForm(), "en", field("formTitle" as never, null), "Survey");

    expect(next.translations).toEqual({ en: { title: "Survey" } });
  });

  it("записує текст питання й варіант, не чіпаючи інші питання", () => {
    const form = baseForm({
      questions: [
        ...baseForm().questions,
        question({ id: "t", text: "Інше", order: 1 }),
      ],
    });
    const step1 = setFieldTranslation(form, "en", field("questionText" as never, 0), "Drink");
    const step2 = setFieldTranslation(step1, "en", field("option" as never, 0, "o1"), "Coffee");

    expect(step2.questions[0].translations).toEqual({ en: { text: "Drink", options: { o1: "Coffee" } } });
    expect(step2.questions[1]).toBe(form.questions[1]);
  });

  it("порожнє значення прибирає переклад, а порожні структури зникають зовсім", () => {
    const withValue = setFieldTranslation(baseForm(), "en", field("formTitle" as never, null), "Survey");
    const cleared = setFieldTranslation(withValue, "en", field("formTitle" as never, null), "  ");

    expect(cleared.translations).toBeNull();

    const q1 = setFieldTranslation(baseForm(), "en", field("option" as never, 0, "o1"), "Coffee");
    const q2 = setFieldTranslation(q1, "en", field("option" as never, 0, "o1"), "");

    expect(q2.questions[0].translations).toBeNull();
  });

  it("не змінює вхідний стан", () => {
    const form = baseForm();
    const snapshot = JSON.stringify(form);

    setFieldTranslation(form, "en", field("questionText" as never, 0), "Drink");

    expect(JSON.stringify(form)).toBe(snapshot);
  });

  it("невідомий індекс питання не ламає стан", () => {
    const form = baseForm();

    expect(setFieldTranslation(form, "en", field("questionText" as never, 99), "x")).toBe(form);
  });

  it("підписи шкали й рядки матриці", () => {
    const form = baseForm({
      questions: [
        question({
          id: "m",
          type: "MATRIX",
          options: [{ id: "a", text: "A", isDefault: false }],
          config: { rows: [{ id: "r1", text: "Рядок" }] },
        }),
      ],
    });
    const next = setFieldTranslation(form, "en", field("row" as never, 0, "r1"), "Row");
    const labeled = setFieldTranslation(next, "en", field("minLabel" as never, 0), "Bad");

    expect(labeled.questions[0].translations).toEqual({ en: { rows: { r1: "Row" }, minLabel: "Bad" } });
  });
});

describe("addLanguage / removeLanguage / changeMainLanguage", () => {
  it("додає нову мову", () => {
    expect(addLanguage(baseForm(), "pl").languages).toEqual(["en", "pl"]);
  });

  it("ігнорує дублікат, основну мову, невідомий код і перевищення ліміту", () => {
    const form = baseForm();

    expect(addLanguage(form, "en")).toBe(form);
    expect(addLanguage(form, "uk")).toBe(form);
    expect(addLanguage(form, "xx")).toBe(form);

    const full = baseForm({
      languages: ["en", "pl", "de", "fr", "es", "it", "pt", "nl", "cs", "sk"],
    });
    expect(canAddLanguage(full)).toBe(false);
    expect(addLanguage(full, "ro")).toBe(full);
  });

  it("removeLanguage прибирає мову й усі її переклади (форми та питань)", () => {
    const form = baseForm({
      languages: ["en", "pl"],
      translations: { en: { title: "Survey" }, pl: { title: "Ankieta" } },
      questions: [
        question({ id: "q", translations: { en: { text: "Q" }, pl: { text: "P" } } }),
        question({ id: "q2", order: 1, translations: { en: { text: "Q2" } } }),
      ],
    });
    const next = removeLanguage(form, "en");

    expect(next.languages).toEqual(["pl"]);
    expect(next.translations).toEqual({ pl: { title: "Ankieta" } });
    expect(next.questions[0].translations).toEqual({ pl: { text: "P" } });
    // питання, де лишалась тільки видалена мова, не тримає порожній об'єкт
    expect(next.questions[1].translations).toBeNull();
  });

  it("removeLanguage для мови, якої немає, нічого не робить", () => {
    const form = baseForm();

    expect(removeLanguage(form, "pl")).toBe(form);
  });

  it("основну мову можна змінити, але не на вже додану", () => {
    const form = baseForm();

    expect(changeMainLanguage(form, "pl").defaultLanguage).toBe("pl");
    expect(changeMainLanguage(form, "en")).toBe(form);
    expect(changeMainLanguage(form, "xx")).toBe(form);
  });

  it("getAvailableLanguages виключає основну й додані", () => {
    const available = getAvailableLanguages(baseForm());

    expect(available).not.toContain("uk");
    expect(available).not.toContain("en");
    expect(available).toContain("pl");
  });
});

describe("copyMissingFromMain", () => {
  it("копіює основний текст лише в порожні поля, наявні переклади не чіпає", () => {
    const form = baseForm({
      translations: { en: { title: "Survey" } },
      questions: [
        question({
          id: "c",
          type: "CHOICE_SINGLE",
          text: "Напій",
          options: [{ id: "o1", text: "Кава", isDefault: false }],
          translations: { en: { options: { o1: "Coffee" } } },
        }),
      ],
    });
    const next = copyMissingFromMain(form, "en");

    expect(next.translations).toEqual({ en: { title: "Survey", description: "Опис форми" } });
    expect(next.questions[0].translations).toEqual({
      en: { text: "Напій", options: { o1: "Coffee" } },
    });
    expect(countMissingTranslations(next, "en")).toBe(0);
  });
});

describe("getLanguageName", () => {
  it("назва мови мовою інтерфейсу з великої літери", () => {
    expect(getLanguageName("en", "uk")).toBe("Англійська");
    expect(getLanguageName("pl", "en")).toBe("Polish");
  });

  it("некоректний код не падає", () => {
    expect(getLanguageName("!!", "en")).toBeTruthy();
  });
});

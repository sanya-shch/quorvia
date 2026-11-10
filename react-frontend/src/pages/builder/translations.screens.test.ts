import { describe, expect, it } from "vitest";
import type { FormState } from "../../types/formBuilder";
import {
  countMissingTranslations,
  listTranslationFields,
  setFieldTranslation,
} from "./translations";

const base = (overrides: Partial<FormState> = {}): FormState => ({
  title: "Форма",
  description: "",
  responseMode: "ALL_AT_ONCE",
  defaultLanguage: "uk",
  languages: ["en"],
  translations: null,
  questions: [],
  ...overrides,
});

const kinds = (form: FormState) => listTranslationFields(form, "en").map((field) => field.kind);

describe("screen texts as translatable fields", () => {
  it("lists nothing for forms without screens", () => {
    expect(kinds(base())).toEqual(["formTitle"]);
  });

  it("lists the welcome fields that have text and the end message", () => {
    const form = base({
      welcomeScreen: { title: "Вітаємо", text: "Опис", buttonLabel: "" },
      endScreen: { text: "Дякуємо" },
    });

    expect(kinds(form)).toEqual(["formTitle", "welcomeTitle", "welcomeText", "endText"]);
  });

  it("includes the button label only when the author set one", () => {
    const form = base({ welcomeScreen: { title: "Вітаємо", buttonLabel: "Поїхали" } });

    expect(kinds(form)).toContain("welcomeButton");
  });

  it("shows the current translation of each field", () => {
    const form = base({
      welcomeScreen: { title: "Вітаємо" },
      endScreen: { text: "Дякуємо" },
      translations: { en: { welcomeTitle: "Welcome", endText: "Thank you" } },
    });
    const values = Object.fromEntries(
      listTranslationFields(form, "en").map((field) => [field.kind, field.value]),
    );

    expect(values).toMatchObject({ welcomeTitle: "Welcome", endText: "Thank you", formTitle: "" });
  });

  it("counts untranslated screen texts as missing", () => {
    const form = base({
      welcomeScreen: { title: "Вітаємо", text: "Опис" },
      endScreen: { text: "Дякуємо" },
      translations: { en: { title: "Form", welcomeTitle: "Welcome" } },
    });

    // welcomeText and endText are still missing.
    expect(countMissingTranslations(form, "en")).toBe(2);
  });

  it("writes each screen field to its own key and removes it when blank", () => {
    let form = base({
      welcomeScreen: { title: "Вітаємо", text: "Опис", buttonLabel: "Go" },
      endScreen: { text: "Дякуємо" },
    });
    const at = (
      kind: "welcomeTitle" | "welcomeText" | "welcomeButton" | "endText",
      value: string,
    ) => {
      form = setFieldTranslation(form, "en", { kind, questionIndex: null, refId: null }, value);
    };

    at("welcomeTitle", "Welcome");
    at("welcomeText", "About");
    at("welcomeButton", "Let's go");
    at("endText", "Thank you");

    expect(form.translations).toEqual({
      en: {
        welcomeTitle: "Welcome",
        welcomeText: "About",
        welcomeButton: "Let's go",
        endText: "Thank you",
      },
    });

    at("welcomeText", "  ");

    expect(form.translations).toEqual({
      en: { welcomeTitle: "Welcome", welcomeButton: "Let's go", endText: "Thank you" },
    });
  });

  it("keeps the title and the description key mapping intact", () => {
    let form = base();

    form = setFieldTranslation(
      form,
      "en",
      { kind: "formTitle", questionIndex: null, refId: null },
      "Form",
    );
    form = setFieldTranslation(
      form,
      "en",
      { kind: "formDescription", questionIndex: null, refId: null },
      "About",
    );

    expect(form.translations).toEqual({ en: { title: "Form", description: "About" } });
  });
});

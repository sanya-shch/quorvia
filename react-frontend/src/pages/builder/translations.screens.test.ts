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

describe("end rule texts as translatable fields", () => {
  const rule = (id: string, text: string) => ({
    id,
    condition: {
      logic: "AND" as const,
      rules: [{ questionId: "q1", operator: "gt" as const, value: 5 }],
    },
    screen: { text },
  });

  it("lists the message of every finished rule after the end screen message", () => {
    const form = base({
      endScreen: { text: "Дякуємо" },
      endRules: [rule("a", "Чудово"), rule("b", "Дякуємо за відгук")],
    });
    const fields = listTranslationFields(form, "en");

    expect(fields.map((f) => f.kind)).toEqual([
      "formTitle",
      "endText",
      "endRuleText",
      "endRuleText",
    ]);
    expect(fields.filter((f) => f.kind === "endRuleText").map((f) => f.refId)).toEqual(["a", "b"]);
  });

  it("skips a rule that is not finished: it is not saved, so there is nothing to translate", () => {
    const form = base({ endRules: [rule("a", ""), rule("b", "Чудово")] });

    expect(listTranslationFields(form, "en").map((f) => f.refId)).toEqual([null, "b"]);
  });

  it("shows the current translation of a rule", () => {
    const form = base({
      endRules: [rule("a", "Чудово")],
      translations: { en: { endRules: { a: "Great!" } } },
    });
    const field = listTranslationFields(form, "en").find((f) => f.kind === "endRuleText");

    expect(field?.value).toBe("Great!");
  });

  it("counts an untranslated rule as missing", () => {
    const form = base({ endRules: [rule("a", "Чудово"), rule("b", "Добре")] });

    // The title and both rules.
    expect(countMissingTranslations(form, "en")).toBe(3);
  });

  it("writes and removes the translation of one rule without touching the others", () => {
    const form = base({
      endScreen: { text: "Дякуємо" },
      endRules: [rule("a", "Чудово"), rule("b", "Добре")],
      translations: { en: { endText: "Thanks" } },
    });
    const field = { kind: "endRuleText" as const, questionIndex: null, refId: "a" };

    const added = setFieldTranslation(form, "en", field, "Great!");

    expect(added.translations).toEqual({ en: { endText: "Thanks", endRules: { a: "Great!" } } });

    const both = setFieldTranslation(added, "en", { ...field, refId: "b" }, "Good");

    expect(both.translations?.en?.endRules).toEqual({ a: "Great!", b: "Good" });

    const removed = setFieldTranslation(both, "en", field, "  ");

    expect(removed.translations?.en?.endRules).toEqual({ b: "Good" });
    expect(
      setFieldTranslation(setFieldTranslation(added, "en", field, ""), "en", { ...field }, "")
        .translations,
    ).toEqual({ en: { endText: "Thanks" } });
  });
});

describe("score category labels as translatable fields", () => {
  const scoring = (enabled: boolean) => ({
    enabled,
    categories: [
      { id: "a", label: "Початківець", min: "0", max: "30" },
      { id: "b", label: "", min: "31", max: "60" },
      { id: "c", label: "Експерт", min: "61", max: "100" },
      { id: "d", label: "Зламана", min: "50", max: "70" },
    ],
  });

  it("lists the labels of the categories that will be saved, while scoring is on", () => {
    const fields = listTranslationFields(base({ scoring: scoring(true) }), "en").filter(
      (f) => f.kind === "scoreCategoryLabel",
    );

    // "b" has no label and "d" overlaps "c": neither is saved, so neither is translatable.
    expect(fields.map((f) => f.refId)).toEqual(["a", "c"]);
    expect(fields.map((f) => f.source)).toEqual(["Початківець", "Експерт"]);
  });

  it("lists nothing while scoring is off", () => {
    expect(
      listTranslationFields(base({ scoring: scoring(false) }), "en").some(
        (f) => f.kind === "scoreCategoryLabel",
      ),
    ).toBe(false);
  });

  it("shows the current translation and counts a missing one", () => {
    const form = base({
      scoring: scoring(true),
      translations: { en: { scoreCategories: { a: "Beginner" } } },
    });

    expect(listTranslationFields(form, "en").find((f) => f.refId === "a")?.value).toBe("Beginner");
    // The title and the label of "c".
    expect(countMissingTranslations(form, "en")).toBe(2);
  });

  it("writes and clears the translation of one category without touching the others", () => {
    const form = base({ scoring: scoring(true), translations: { en: { endText: "Thanks" } } });
    const field = { kind: "scoreCategoryLabel" as const, questionIndex: null, refId: "a" };

    const added = setFieldTranslation(form, "en", field, "Beginner");

    expect(added.translations).toEqual({
      en: { endText: "Thanks", scoreCategories: { a: "Beginner" } },
    });

    const both = setFieldTranslation(added, "en", { ...field, refId: "c" }, "Expert");

    expect(both.translations?.en?.scoreCategories).toEqual({ a: "Beginner", c: "Expert" });
    expect(setFieldTranslation(both, "en", field, " ").translations?.en?.scoreCategories).toEqual({
      c: "Expert",
    });
  });
});

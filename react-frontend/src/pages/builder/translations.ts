import {
  CONTENT_LOCALES,
  DEFAULT_CONTENT_LANGUAGE,
  isContentLocale,
  MAX_ADDITIONAL_LANGUAGES,
  type FormTranslation,
  type QuestionTranslation,
  type QuestionTranslations,
} from "@quorvia/shared-types";
import type { FormState, Question } from "../../types/formBuilder";
import { questionTypeUsesOptions } from "./questionConfig";

// Everything about translating a form in the builder: pure functions over FormState (no
// React), easy to test; the UI only calls them through `updateForm(updater)`.

export const getMainLanguage = (form: FormState): string =>
  form.defaultLanguage ?? DEFAULT_CONTENT_LANGUAGE;

export const getAdditionalLanguages = (form: FormState): string[] => form.languages ?? [];

// Languages that can still be added: every supported one except the main and the already added.
export const getAvailableLanguages = (form: FormState): string[] => {
  const taken = new Set([getMainLanguage(form), ...getAdditionalLanguages(form)]);

  return CONTENT_LOCALES.filter((locale) => !taken.has(locale));
};

export const canAddLanguage = (form: FormState): boolean =>
  getAdditionalLanguages(form).length < MAX_ADDITIONAL_LANGUAGES;

export { getLanguageName } from "../../i18n/languageNames";

export type TranslationFieldKind =
  | "formTitle"
  | "formDescription"
  | "questionText"
  | "questionDescription"
  | "option"
  | "row"
  | "minLabel"
  | "maxLabel";

export interface TranslationField {
  // Stable key for React and tests.
  key: string;
  kind: TranslationFieldKind;
  // Index in form.questions; null for the form's own fields.
  questionIndex: number | null;
  // Option/column (option) or matrix row (row) id.
  refId: string | null;
  // Text in the main language.
  source: string;
  // Current translation (empty string if none).
  value: string;
  multiline: boolean;
}

const isBlank = (value: string | null | undefined): boolean => !value || value.trim() === "";

// Every translatable field with its current translation in `language`. Fields whose main
// text is empty are skipped: there is nothing to translate.
export const listTranslationFields = (form: FormState, language: string): TranslationField[] => {
  const fields: TranslationField[] = [];
  const formEntry: FormTranslation | undefined = form.translations?.[language];

  const push = (field: Omit<TranslationField, "value"> & { value: string | undefined }) => {
    if (isBlank(field.source)) return;
    fields.push({ ...field, value: field.value ?? "" });
  };

  push({
    key: "form:title",
    kind: "formTitle",
    questionIndex: null,
    refId: null,
    source: form.title,
    value: formEntry?.title,
    multiline: false,
  });
  push({
    key: "form:description",
    kind: "formDescription",
    questionIndex: null,
    refId: null,
    source: form.description ?? "",
    value: formEntry?.description,
    multiline: true,
  });

  form.questions.forEach((question, index) => {
    const entry: QuestionTranslation | undefined = question.translations?.[language];

    push({
      key: `q:${index}:text`,
      kind: "questionText",
      questionIndex: index,
      refId: null,
      source: question.text,
      value: entry?.text,
      multiline: false,
    });
    push({
      key: `q:${index}:description`,
      kind: "questionDescription",
      questionIndex: index,
      refId: null,
      source: question.description ?? "",
      value: entry?.description,
      multiline: true,
    });

    if (questionTypeUsesOptions(question.type)) {
      for (const option of question.options) {
        push({
          key: `q:${index}:option:${option.id}`,
          kind: "option",
          questionIndex: index,
          refId: option.id,
          source: option.text,
          value: entry?.options?.[option.id],
          multiline: false,
        });
      }
    }

    for (const row of question.config?.rows ?? []) {
      push({
        key: `q:${index}:row:${row.id}`,
        kind: "row",
        questionIndex: index,
        refId: row.id,
        source: row.text,
        value: entry?.rows?.[row.id],
        multiline: false,
      });
    }

    if (question.type === "SCALE") {
      push({
        key: `q:${index}:minLabel`,
        kind: "minLabel",
        questionIndex: index,
        refId: null,
        source: question.config?.minLabel ?? "",
        value: entry?.minLabel,
        multiline: false,
      });
      push({
        key: `q:${index}:maxLabel`,
        kind: "maxLabel",
        questionIndex: index,
        refId: null,
        source: question.config?.maxLabel ?? "",
        value: entry?.maxLabel,
        multiline: false,
      });
    }
  });

  return fields;
};

// How many fields are still untranslated in `language` (an empty translation = untranslated).
export const countMissingTranslations = (form: FormState, language: string): number =>
  listTranslationFields(form, language).filter((field) => isBlank(field.value)).length;

// A "key -> value" map without empty values; an empty map -> undefined.
const withMapValue = (
  map: Record<string, string> | undefined,
  key: string,
  value: string,
): Record<string, string> | undefined => {
  const next = { ...map };

  if (isBlank(value)) delete next[key];
  else next[key] = value;

  return Object.keys(next).length > 0 ? next : undefined;
};

// A language entry without empty fields; a fully empty entry -> undefined.
const compact = <T extends object>(entry: T): T | undefined => {
  const cleaned = Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined),
  ) as T;

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
};

// Adds/changes/removes a language entry; an empty result -> null (same as on the server).
const withLanguageEntry = <E extends object>(
  translations: Record<string, E> | null | undefined,
  language: string,
  entry: E | undefined,
): Record<string, E> | null => {
  const next = { ...translations };

  if (entry) next[language] = entry;
  else delete next[language];

  return Object.keys(next).length > 0 ? next : null;
};

// The new form state where `field` in `language` has the value `value` (empty removes the translation).
export const setFieldTranslation = (
  form: FormState,
  language: string,
  field: Pick<TranslationField, "kind" | "questionIndex" | "refId">,
  value: string,
): FormState => {
  const blank = isBlank(value);

  if (field.questionIndex === null) {
    const entry: FormTranslation = { ...form.translations?.[language] };
    const key = field.kind === "formTitle" ? "title" : "description";

    entry[key] = blank ? undefined : value;

    return {
      ...form,
      translations: withLanguageEntry(form.translations, language, compact(entry)),
    };
  }

  const index = field.questionIndex;
  const question = form.questions[index];
  if (!question) return form;

  const entry: QuestionTranslation = { ...question.translations?.[language] };

  switch (field.kind) {
    case "questionText":
      entry.text = blank ? undefined : value;
      break;
    case "questionDescription":
      entry.description = blank ? undefined : value;
      break;
    case "minLabel":
      entry.minLabel = blank ? undefined : value;
      break;
    case "maxLabel":
      entry.maxLabel = blank ? undefined : value;
      break;
    case "option":
      entry.options = withMapValue(entry.options, field.refId!, value);
      break;
    case "row":
      entry.rows = withMapValue(entry.rows, field.refId!, value);
      break;
    default:
      return form;
  }

  const translations: QuestionTranslations | null = withLanguageEntry(
    question.translations,
    language,
    compact(entry),
  );

  return {
    ...form,
    questions: form.questions.map((q, i): Question => (i === index ? { ...q, translations } : q)),
  };
};

// Adds an additional language (ignores unknown codes, duplicates, the main language and anything over the limit).
export const addLanguage = (form: FormState, language: string): FormState => {
  if (
    !isContentLocale(language) ||
    language === getMainLanguage(form) ||
    getAdditionalLanguages(form).includes(language) ||
    !canAddLanguage(form)
  ) {
    return form;
  }

  return { ...form, languages: [...getAdditionalLanguages(form), language] };
};

// Removes a language together with all its translations (form and questions).
export const removeLanguage = (form: FormState, language: string): FormState => {
  if (!getAdditionalLanguages(form).includes(language)) return form;

  return {
    ...form,
    languages: getAdditionalLanguages(form).filter((l) => l !== language),
    translations: withLanguageEntry(form.translations, language, undefined),
    questions: form.questions.map((question) =>
      question.translations?.[language]
        ? { ...question, translations: withLanguageEntry(question.translations, language, undefined) }
        : question,
    ),
  };
};

// Changes the language the form is written in. A language that is already additional cannot
// be chosen (the server would reject such a form): remove it first.
export const changeMainLanguage = (form: FormState, language: string): FormState => {
  if (!isContentLocale(language) || getAdditionalLanguages(form).includes(language)) return form;

  return { ...form, defaultLanguage: language };
};

// Fills with the main text only the fields that have no translation yet.
export const copyMissingFromMain = (form: FormState, language: string): FormState =>
  listTranslationFields(form, language)
    .filter((field) => isBlank(field.value))
    .reduce((next, field) => setFieldTranslation(next, language, field, field.source), form);

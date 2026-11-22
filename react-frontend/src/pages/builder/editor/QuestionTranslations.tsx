import { useState } from "react";
import { useTranslation } from "react-i18next";
import AppIcon from "../../../components/ui/AppIcon";
import type { FormState } from "../../../types/formBuilder";
import {
  getAdditionalLanguages,
  getLanguageName,
  getMainLanguage,
  listTranslationFields,
  setFieldTranslation,
  type TranslationField,
  type TranslationFieldKind,
} from "../translations";

interface QuestionTranslationsProps {
  form: FormState;
  questionIndex: number;
  onChange: (updater: (prev: FormState) => FormState) => void;
  // Opens the form-level language setup (adding / removing a language) in Settings.
  settingsHref: string;
}

const LABEL_KEYS: Partial<Record<TranslationFieldKind, string>> = {
  questionText: "builder.languages.fields.questionText",
  questionDescription: "builder.languages.fields.questionDescription",
  option: "builder.languages.fields.option",
  row: "builder.languages.fields.row",
  minLabel: "builder.languages.fields.minLabel",
  maxLabel: "builder.languages.fields.maxLabel",
};

// The selected question's translations, per language. They are the same fields the language
// panel in Settings edits (listTranslationFields / setFieldTranslation), narrowed to one
// question, so the two places can never disagree. The main language is the source of truth:
// it is shown as the text each translation is written against.
export default function QuestionTranslations({
  form,
  questionIndex,
  onChange,
  settingsHref,
}: QuestionTranslationsProps) {
  const { t, i18n } = useTranslation();
  const main = getMainLanguage(form);
  const others = getAdditionalLanguages(form);
  const [open, setOpen] = useState<string | null>(null);
  const name = (code: string) => getLanguageName(code, i18n.language);

  const fieldsOf = (language: string): TranslationField[] =>
    listTranslationFields(form, language).filter((f) => f.questionIndex === questionIndex);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-slate-700">
          <AppIcon name="globe" className="h-4 w-4 text-slate-400" />
          {name(main)}
        </span>
        <span className="text-xs font-bold text-emerald-600">
          {t("builder.editor.inspector.translations.main")}
        </span>
      </div>

      {others.map((language) => {
        const fields = fieldsOf(language);
        const missing = fields.filter((f) => f.value.trim() === "").length;
        const isOpen = open === language;
        return (
          <div key={language} className="rounded-xl border border-slate-200">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : language)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-sm cursor-pointer"
            >
              <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                <AppIcon name="globe" className="h-4 w-4 text-slate-400" />
                {name(language)}
              </span>
              <span
                className={`text-xs font-bold ${missing > 0 ? "text-rose-600" : "text-emerald-600"}`}
              >
                {missing > 0
                  ? t("builder.editor.inspector.translations.missing", { count: missing })
                  : t("builder.editor.inspector.translations.complete")}
              </span>
            </button>

            {isOpen && (
              <div className="space-y-3 border-t border-slate-100 p-3">
                {fields.map((field) => {
                  const label = t(
                    LABEL_KEYS[field.kind] ?? "builder.languages.fields.questionText",
                  );
                  const empty = field.value.trim() === "";
                  const Tag = field.multiline ? "textarea" : "input";
                  return (
                    <div key={field.key} className="space-y-1">
                      <label
                        htmlFor={`qt-${field.key}`}
                        className="block text-xs font-semibold text-slate-500"
                      >
                        {label}
                        <span className="ml-1.5 font-normal text-slate-400">{field.source}</span>
                      </label>
                      <Tag
                        id={`qt-${field.key}`}
                        lang={language}
                        value={field.value}
                        placeholder={field.source}
                        onChange={(e) =>
                          onChange((prev) =>
                            setFieldTranslation(prev, language, field, e.target.value),
                          )
                        }
                        {...(field.multiline ? { rows: 2 } : { type: "text" })}
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                          empty ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"
                        }`}
                      />
                    </div>
                  );
                })}
                {fields.length === 0 && (
                  <p className="text-xs text-slate-500">
                    {t("builder.languages.nothingToTranslate")}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <a
        href={settingsHref}
        className="inline-block text-xs font-semibold text-indigo-600 hover:underline"
      >
        {t("builder.editor.inspector.translations.manage")}
      </a>
    </div>
  );
}

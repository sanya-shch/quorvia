import { useTranslation } from "react-i18next";
import type { FormState } from "../../../types/formBuilder";
import {
  copyMissingFromMain,
  getLanguageName,
  getMainLanguage,
  listTranslationFields,
  setFieldTranslation,
  type TranslationField,
  type TranslationFieldKind,
} from "../translations";

interface TranslationPanelProps {
  form: FormState;
  /** Додаткова мова, яку перекладаємо. */
  language: string;
  onChange: (updater: (prev: FormState) => FormState) => void;
  onRemoveLanguage: () => void;
}

const FIELD_LABEL_KEYS: Record<TranslationFieldKind, string> = {
  formTitle: "builder.languages.fields.formTitle",
  formDescription: "builder.languages.fields.formDescription",
  questionText: "builder.languages.fields.questionText",
  questionDescription: "builder.languages.fields.questionDescription",
  option: "builder.languages.fields.option",
  row: "builder.languages.fields.row",
  minLabel: "builder.languages.fields.minLabel",
  maxLabel: "builder.languages.fields.maxLabel",
};

const inputClass =
  "w-full rounded-xl border px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

/**
 * Редактор перекладу: для кожного поля - текст основною мовою (лише для
 * читання) і поле для перекладу. Структуру форми тут змінити не можна: це
 * робиться у вкладці основної мови.
 */
export default function TranslationPanel({
  form,
  language,
  onChange,
  onRemoveLanguage,
}: TranslationPanelProps) {
  const { t, i18n } = useTranslation();
  const languageName = getLanguageName(language, i18n.language);
  const mainName = getLanguageName(getMainLanguage(form), i18n.language);
  const fields = listTranslationFields(form, language);
  const missing = fields.filter((field) => field.value.trim() === "").length;

  // Групуємо поля за питанням, зберігаючи порядок (null - сама форма).
  const groups: { questionIndex: number | null; fields: TranslationField[] }[] = [];
  for (const field of fields) {
    const last = groups[groups.length - 1];

    if (last && last.questionIndex === field.questionIndex) last.fields.push(field);
    else groups.push({ questionIndex: field.questionIndex, fields: [field] });
  }

  const renderField = (field: TranslationField) => {
    const label = t(FIELD_LABEL_KEYS[field.kind]);
    const isMissing = field.value.trim() === "";
    const Tag = field.multiline ? "textarea" : "input";

    return (
      <div key={field.key} className="space-y-1">
        <label
          htmlFor={`tr-${field.key}`}
          className="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold text-slate-500"
        >
          {label}
          <span className="font-normal text-slate-400">
            {t("builder.languages.sourceLabel", { language: mainName })}: {field.source}
          </span>
        </label>
        <Tag
          id={`tr-${field.key}`}
          lang={language}
          value={field.value}
          onChange={(e) =>
            onChange((prev) => setFieldTranslation(prev, language, field, e.target.value))
          }
          aria-label={t("builder.languages.translationAria", { language: languageName, field: label })}
          placeholder={field.source}
          {...(field.multiline ? { rows: 2 } : { type: "text" })}
          className={`${inputClass} ${
            isMissing ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"
          }`}
        />
      </div>
    );
  };

  return (
    <section
      aria-label={t("builder.languages.panelTitle", { language: languageName })}
      className="space-y-4"
    >
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {t("builder.languages.panelTitle", { language: languageName })}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">{t("builder.languages.fallbackHint")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-xs font-semibold px-2 py-1 rounded-md ${
                missing > 0 ? "text-amber-700 bg-amber-50" : "text-emerald-700 bg-emerald-50"
              }`}
            >
              {missing > 0
                ? t("builder.languages.missingCount", { count: missing })
                : t("builder.languages.allTranslated")}
            </span>
            <button
              type="button"
              onClick={() => onChange((prev) => copyMissingFromMain(prev, language))}
              disabled={missing === 0}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {t("builder.languages.copyMissing")}
            </button>
            <button
              type="button"
              onClick={onRemoveLanguage}
              className="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
            >
              {t("builder.languages.remove")}
            </button>
          </div>
        </div>
      </div>

      {fields.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          {t("builder.languages.nothingToTranslate")}
        </p>
      )}

      {groups.map((group) => (
        <div
          key={group.questionIndex ?? "form"}
          className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {group.questionIndex === null
              ? t("builder.languages.formSection")
              : t("builder.languages.questionSection", { number: group.questionIndex + 1 })}
          </h3>
          {group.fields.map(renderField)}
        </div>
      ))}
    </section>
  );
}

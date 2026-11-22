import { useTranslation } from "react-i18next";
import { getLanguageName } from "../../../i18n/languageNames";
import type { FormState } from "../../../types/formBuilder";
import {
  getAdditionalLanguages,
  getMainLanguage,
  countMissingTranslations,
} from "../../builder/translations";
import Card from "./Card";

interface FormInformationCardProps {
  form: FormState;
  createdAt?: string;
  updatedAt?: string;
  onEdit: () => void;
}

export default function FormInformationCard({
  form,
  createdAt,
  updatedAt,
  onEdit,
}: FormInformationCardProps) {
  const { t, i18n } = useTranslation();
  const date = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(iso),
        )
      : "-";
  const languages = [getMainLanguage(form), ...getAdditionalLanguages(form)];

  return (
    <Card
      title={t("workspace.overview.info.title")}
      action={
        <button
          type="button"
          onClick={onEdit}
          className="font-semibold text-indigo-600 hover:underline cursor-pointer"
        >
          {t("workspace.overview.info.edit")}
        </button>
      }
    >
      <p className="whitespace-pre-line text-sm text-slate-600">
        {form.description || (
          <span className="text-slate-400">{t("workspace.overview.info.noDescription")}</span>
        )}
      </p>
      <dl className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-sm">
        <div className="flex justify-between gap-4 py-2">
          <dt className="text-slate-500">{t("workspace.overview.info.created")}</dt>
          <dd className="font-semibold text-slate-900">{date(createdAt)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-2">
          <dt className="text-slate-500">{t("workspace.overview.info.updated")}</dt>
          <dd className="font-semibold text-slate-900">{date(updatedAt)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-2">
          <dt className="text-slate-500">{t("workspace.overview.info.languages")}</dt>
          <dd className="text-right font-semibold text-slate-900">
            {languages.map((code) => getLanguageName(code, i18n.language)).join(", ")}
          </dd>
        </div>
        {getAdditionalLanguages(form).map((code) => {
          const missing = countMissingTranslations(form, code);
          return (
            <div key={code} className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">{getLanguageName(code, i18n.language)}</dt>
              <dd
                className={`font-semibold ${missing > 0 ? "text-amber-600" : "text-emerald-600"}`}
              >
                {missing > 0
                  ? t("workspace.overview.info.missing", { count: missing })
                  : t("workspace.overview.info.complete")}
              </dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

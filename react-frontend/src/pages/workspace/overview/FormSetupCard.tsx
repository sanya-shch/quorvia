import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getLanguageName } from "../../../i18n/languageNames";
import type { FormState } from "../../../types/formBuilder";
import { getMainLanguage } from "../../builder/translations";
import type { PublicationStatus } from "../formStatus";
import Card from "./Card";

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-right font-semibold text-slate-900">{children}</dd>
  </div>
);

export default function FormSetupCard({
  formId,
  form,
  status,
}: {
  formId: string;
  form: FormState;
  status: PublicationStatus;
}) {
  const { t, i18n } = useTranslation();
  const others = form.languages ?? [];
  const toName = (code: string) => getLanguageName(code, i18n.language);

  return (
    <Card
      title={t("workspace.overview.setup.title")}
      action={<Link to={`/forms/${formId}/settings`}>{t("workspace.overview.setup.edit")}</Link>}
    >
      <dl className="divide-y divide-slate-100">
        <Row label={t("workspace.overview.setup.questions")}>{form.questions.length}</Row>
        <Row label={t("workspace.overview.setup.mode")}>
          {t(`workspace.overview.setup.modes.${form.responseMode}`)}
        </Row>
        <Row label={t("workspace.overview.setup.mainLanguage")}>
          {toName(getMainLanguage(form))}
        </Row>
        <Row label={t("workspace.overview.setup.otherLanguages")}>
          {others.length > 0 ? others.map(toName).join(", ") : t("workspace.overview.setup.none")}
        </Row>
        <Row label={t("workspace.overview.setup.status")}>
          <span className={status === "published" ? "text-emerald-700" : "text-slate-700"}>
            {t(`workspace.status.${status}`)}
          </span>
        </Row>
      </dl>
    </Card>
  );
}

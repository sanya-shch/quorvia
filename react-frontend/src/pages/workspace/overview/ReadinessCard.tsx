import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppIcon from "../../../components/ui/AppIcon";
import type { Readiness } from "../readiness";
import Card from "./Card";

const ICON = { ok: "checkCircle", warning: "warning", error: "warning" } as const;
const TONE = { ok: "text-emerald-700", warning: "text-amber-700", error: "text-rose-700" } as const;

// Whether the form can be published. These are the builder's own validation results, so an
// "error" here is exactly what would also block saving in the builder.
export default function ReadinessCard({
  formId,
  readiness,
}: {
  formId: string;
  readiness: Readiness;
}) {
  const { t } = useTranslation();

  return (
    <Card
      title={t("workspace.readiness.title")}
      subtitle={
        readiness.canPublish
          ? t("workspace.readiness.ready")
          : t("workspace.readiness.issues", { count: readiness.errorCount })
      }
      action={
        !readiness.canPublish && (
          <Link to={`/forms/${formId}/builder`}>{t("workspace.readiness.fix")}</Link>
        )
      }
    >
      <ul className="space-y-2.5">
        {readiness.checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2.5 text-sm">
            <span className={`mt-0.5 ${TONE[check.level]}`}>
              <AppIcon name={ICON[check.level]} className="h-4 w-4" />
            </span>
            <span className="text-slate-700">{t(check.labelKey, check.params)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

import { useTranslation } from "react-i18next";
import type { FormTheme } from "@quorvia/shared-types";
import ThemeScope from "../../viewer/theme/ThemeScope";

interface ThemePreviewProps {
  theme: FormTheme | null | undefined;
}

// A small stand-in for the public form that uses the same classes as the real viewer, inside the
// same ThemeScope, so what the author sees here is what respondents get.
export default function ThemePreview({ theme }: ThemePreviewProps) {
  const { t } = useTranslation();

  return (
    <ThemeScope theme={theme} className="rounded-xl">
      <div
        className="rounded-xl bg-slate-50 p-4 border border-slate-200"
        data-testid="theme-preview"
        aria-label={t("builder.theme.preview.label")}
        role="group"
      >
        <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm space-y-3">
          <h3 className="text-lg font-bold text-slate-900">{t("builder.theme.preview.title")}</h3>
          <p className="text-sm text-slate-500">{t("builder.theme.preview.description")}</p>

          <div className="space-y-2">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900">
              {t("builder.theme.preview.selected")}
            </div>
            <div className="rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-600">
              {t("builder.theme.preview.option")}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <span className="inline-flex h-10 items-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-on-primary">
              {t("builder.theme.preview.button")}
            </span>
          </div>
        </div>
      </div>
    </ThemeScope>
  );
}

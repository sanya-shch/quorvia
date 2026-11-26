import { useState } from "react";
import { useTranslation } from "react-i18next";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import { ErrorInfo } from "../../../components/ui/ErrorInfo";
import { getLanguageName } from "../../../i18n/languageNames";
import ClosingEditor from "../../builder/components/ClosingEditor";
import EndRulesEditor from "../../builder/components/EndRulesEditor";
import LanguageBar from "../../builder/components/LanguageBar";
import LogoUploader from "../../builder/components/LogoUploader";
import { IS_FOR_PORTFOLIO } from "../../../config/portfolio";
import QuotasEditor from "../../builder/components/QuotasEditor";
import ScoringEditor from "../../builder/components/ScoringEditor";
import ScreensEditor from "../../builder/components/ScreensEditor";
import ThemeEditor from "../../builder/components/ThemeEditor";
import TranslationPanel from "../../builder/components/TranslationPanel";
import { getMainLanguage, removeLanguage } from "../../builder/translations";
import { getPublicationStatus, publicFormUrl } from "../formStatus";
import { computeReadiness } from "../readiness";
import ShareDialog from "../ShareDialog";
import StatusBadge from "../StatusBadge";
import { useFormActions } from "../useFormActions";
import { useWorkspace } from "../workspaceContext";
import ExportDialog from "../overview/ExportDialog";
import SettingsSection from "./SettingsSection";

const SECTIONS = [
  "general",
  "languages",
  "respondent",
  "scoring",
  "limits",
  "publication",
  "data",
  "danger",
] as const;

const field =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

// Everything that applies to the whole form rather than to one question. It edits the same draft
// as the builder (one save, one version lock), so nothing is duplicated and nothing is lost when
// moving between sections. Question-level settings stay in the builder.
export default function SettingsPage({ formId }: { formId: string }) {
  const { t, i18n } = useTranslation();
  const draft = useWorkspace();
  const { form, serverForm, errors, updateForm, updateFormMeta } = draft;
  const actions = useFormActions(formId);

  const mainLanguage = getMainLanguage(form);
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);
  const currentLanguage =
    activeLanguage && form.languages?.includes(activeLanguage) ? activeLanguage : mainLanguage;
  const isTranslating = currentLanguage !== mainLanguage;
  const [languageToRemove, setLanguageToRemove] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"share" | "export" | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "unpublish" | null>(null);

  const status = getPublicationStatus({
    isPublished: serverForm?.isPublished,
    responseCount: form.responseCount,
  });
  const readiness = computeReadiness(form);
  const shareId = serverForm?.shareId;

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <nav aria-label={t("workspace.settings.nav")} className="hidden lg:block">
        <ul className="sticky top-24 space-y-1">
          {SECTIONS.map((id) => (
            <li key={id}>
              <a
                href={`#settings-${id}`}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900"
              >
                {t(`workspace.settings.sections.${id}.title`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="motion-stagger min-w-0 space-y-6">
        <SettingsSection
          id="settings-general"
          title={t("workspace.settings.sections.general.title")}
          description={t("workspace.settings.sections.general.description")}
        >
          <label className="block text-sm font-semibold text-slate-700">
            {t("workspace.details.formTitle")}
            <input
              value={form.title}
              onChange={(e) => updateFormMeta({ title: e.target.value })}
              className={`${field} mt-1.5`}
              maxLength={200}
              aria-invalid={Boolean(errors.title)}
            />
            {errors.title && <ErrorInfo errorText={t(errors.title)} />}
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            {t("workspace.details.formDescription")}
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => updateFormMeta({ description: e.target.value })}
              className={`${field} mt-1.5`}
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {t("builder.responseMode.label")}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{t("builder.responseMode.hint")}</p>
            </div>
            <div
              role="group"
              aria-label={t("builder.responseMode.label")}
              className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
            >
              {(
                [
                  { value: "ALL_AT_ONCE", label: t("builder.responseMode.allAtOnce") },
                  { value: "STEP_BY_STEP", label: t("builder.responseMode.stepByStep") },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={form.responseMode === opt.value}
                  onClick={() => updateFormMeta({ responseMode: opt.value })}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                    form.responseMode === opt.value
                      ? "bg-indigo-600 text-on-solid"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {!IS_FOR_PORTFOLIO && (
            <div className="border-t border-slate-100 pt-5">
              <LogoUploader
                formId={formId}
                assetId={form.logoAssetId}
                onChange={(logoAssetId) => updateFormMeta({ logoAssetId })}
              />
            </div>
          )}
        </SettingsSection>

        <SettingsSection
          id="settings-languages"
          title={t("workspace.settings.sections.languages.title")}
          description={t("workspace.settings.sections.languages.description")}
        >
          <LanguageBar
            form={form}
            activeLanguage={currentLanguage}
            onSelect={(language) => setActiveLanguage(language === mainLanguage ? null : language)}
            onChange={updateForm}
          />
          {isTranslating && (
            <TranslationPanel
              form={form}
              language={currentLanguage}
              onChange={updateForm}
              onRemoveLanguage={() => setLanguageToRemove(currentLanguage)}
            />
          )}
        </SettingsSection>

        <SettingsSection
          id="settings-respondent"
          title={t("workspace.settings.sections.respondent.title")}
          description={t("workspace.settings.sections.respondent.description")}
        >
          <ScreensEditor
            formTitle={form.title}
            welcomeScreen={form.welcomeScreen}
            endScreen={form.endScreen}
            onWelcomeChange={(welcomeScreen) => updateFormMeta({ welcomeScreen })}
            onEndChange={(endScreen) => updateFormMeta({ endScreen })}
          />
          <div className="border-t border-slate-200 pt-5">
            <EndRulesEditor
              rules={form.endRules}
              questions={form.questions}
              scoringEnabled={form.scoring?.enabled === true}
              onChange={(endRules) => updateFormMeta({ endRules })}
            />
          </div>
          <div className="border-t border-slate-200 pt-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              {t("builder.theme.title")}
            </h3>
            <ThemeEditor theme={form.theme} onChange={(theme) => updateFormMeta({ theme })} />
          </div>
        </SettingsSection>

        <SettingsSection
          id="settings-scoring"
          title={t("workspace.settings.sections.scoring.title")}
          description={t("workspace.settings.sections.scoring.description")}
        >
          <ScoringEditor
            scoring={form.scoring}
            onChange={(scoring) => updateFormMeta({ scoring })}
          />
          {errors.scoring && <ErrorInfo errorText={t(errors.scoring)} />}
        </SettingsSection>

        <SettingsSection
          id="settings-limits"
          title={t("workspace.settings.sections.limits.title")}
          description={t("workspace.settings.sections.limits.description")}
        >
          <ClosingEditor
            closesAt={form.closesAt}
            maxResponses={form.maxResponses}
            responseCount={form.responseCount}
            onChange={(change) => updateFormMeta(change)}
          />
          <div className="border-t border-slate-200 pt-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              {t("builder.quotas.summary")}
            </h3>
            <QuotasEditor formId={formId} questions={form.questions} />
          </div>
        </SettingsSection>

        <SettingsSection
          id="settings-publication"
          title={t("workspace.settings.sections.publication.title")}
          description={t("workspace.settings.sections.publication.description")}
        >
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={status} />
            {status === "published" ? (
              <button
                type="button"
                onClick={() => setConfirm("unpublish")}
                className="h-9 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {t("workspace.header.unpublish")}
              </button>
            ) : (
              <button
                type="button"
                disabled={!readiness.canPublish || actions.publish.isPending}
                onClick={() => actions.publish.mutate()}
                title={readiness.canPublish ? undefined : t("workspace.header.publishBlocked")}
                className="h-9 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-on-solid hover:bg-emerald-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {status === "unpublished"
                  ? t("workspace.header.publishAgain")
                  : t("workspace.header.publish")}
              </button>
            )}
          </div>
          {shareId && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                {publicFormUrl(shareId)}
              </code>
              <button
                type="button"
                onClick={() => setDialog("share")}
                className="h-9 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {t("workspace.header.share")}
              </button>
            </div>
          )}
        </SettingsSection>

        {!IS_FOR_PORTFOLIO && (
          <SettingsSection
            id="settings-data"
            title={t("workspace.settings.sections.data.title")}
            description={t("workspace.settings.sections.data.description")}
          >
            <button
              type="button"
              onClick={() => setDialog("export")}
              className="h-9 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {t("workspace.overview.actions.export")}
            </button>
          </SettingsSection>
        )}

        <SettingsSection
          id="settings-danger"
          danger
          title={t("workspace.settings.sections.danger.title")}
          description={t("workspace.settings.sections.danger.description")}
        >
          <button
            type="button"
            onClick={() => setConfirm("delete")}
            className="h-9 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
          >
            {t("workspace.header.delete")}
          </button>
        </SettingsSection>
      </div>

      <ConfirmModal
        isOpen={languageToRemove !== null}
        title={t("builder.languages.removeModal.title", {
          language: languageToRemove ? getLanguageName(languageToRemove, i18n.language) : "",
        })}
        description={t("builder.languages.removeModal.description")}
        confirmLabel={t("builder.languages.removeModal.confirm")}
        cancelLabel={t("builder.languages.removeModal.cancel")}
        onCancel={() => setLanguageToRemove(null)}
        onConfirm={() => {
          if (languageToRemove) updateForm((prev) => removeLanguage(prev, languageToRemove));
          setLanguageToRemove(null);
        }}
      />
      <ConfirmModal
        isOpen={confirm === "delete"}
        title={t("workspace.confirm.deleteTitle")}
        description={t("workspace.confirm.deleteText")}
        confirmLabel={t("workspace.confirm.deleteAction")}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          actions.remove.mutate();
        }}
      />
      <ConfirmModal
        isOpen={confirm === "unpublish"}
        title={t("workspace.confirm.unpublishTitle")}
        description={t("workspace.confirm.unpublishText")}
        confirmLabel={t("workspace.confirm.unpublishAction")}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          actions.unpublish.mutate();
        }}
      />
      {dialog === "share" && shareId && (
        <ShareDialog
          shareId={shareId}
          isPublished={status === "published"}
          mainLanguage={mainLanguage}
          languages={form.languages ?? []}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "export" && <ExportDialog formId={formId} onClose={() => setDialog(null)} />}
    </div>
  );
}

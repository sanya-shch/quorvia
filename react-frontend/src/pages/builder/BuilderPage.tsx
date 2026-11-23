import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ConfirmModal from "../../components/ui/ConfirmModal";
import type { Question, QuestionType } from "../../types/formBuilder";
import { getMainLanguage } from "./translations";
import {
  createDefaultOptions,
  createDefaultQuestionConfig,
  questionTypeUsesConfig,
  questionTypeUsesOptions,
} from "./questionConfig";
import { computeReadiness } from "../workspace/readiness";
import { getPublicationStatus, publicFormUrl } from "../workspace/formStatus";
import { useFormActions } from "../workspace/useFormActions";
import { useWorkspace } from "../workspace/workspaceContext";
import BuilderHeader from "./editor/BuilderHeader";
import PreviewWorkspace from "./editor/PreviewWorkspace";
import QuestionInspector from "./editor/QuestionInspector";
import QuestionSidebar from "./editor/QuestionSidebar";
import { useDemoLimits } from "../../store/useDemoLimits";
import { clearConditionsOn, findDependents, questionsBrokenByMove } from "./editor/dependencies";

type Pane = "questions" | "preview" | "settings";

// The Builder: three independent columns over one draft (the workspace's), so nothing here keeps
// a second copy of the form.
//   left   - the question list (structure: select, add, reorder, duplicate, delete)
//   centre - the live preview (what a respondent sees; a local session, never saved)
//   right  - the inspector (everything about the selected question)
// UI-only state (which question is selected, which panels are collapsed, which pane is shown on a
// phone) lives here and is never part of the form or saved with it.
export default function BuilderPage() {
  const { t } = useTranslation();
  const { formId = "" } = useParams<{ formId: string }>();
  const draft = useWorkspace();
  const {
    form,
    serverForm,
    errors,
    updateQuestion,
    updateForm,
    addQuestionAtPosition,
    duplicateQuestion,
    deleteQuestion,
    moveQuestion,
    updateFormMeta,
    save,
    saveState,
    lastSavedAt,
  } = draft;
  const actions = useFormActions(formId);

  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [pane, setPane] = useState<Pane>("preview");
  const [previewLanguage, setPreviewLanguage] = useState<string | null>(null);
  const [previewResetKey, setPreviewResetKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [blockedMove, setBlockedMove] = useState<Question[] | null>(null);
  const [pendingType, setPendingType] = useState<QuestionType | null>(null);

  // The selection follows the list: if the selected question is gone (deleted, or the form was
  // reloaded after a conflict) or nothing was chosen yet, the first question counts as selected.
  const rawIndex = form.questions.findIndex((q) => q.id === requestedId);
  const selectedIndex = rawIndex !== -1 ? rawIndex : form.questions.length > 0 ? 0 : -1;
  const selectedId = form.questions[selectedIndex]?.id ?? null;
  const setSelectedId = setRequestedId;

  const question = selectedIndex === -1 ? null : form.questions[selectedIndex];
  const mainLanguage = getMainLanguage(form);
  const languages = useMemo(
    () => [mainLanguage, ...(form.languages ?? [])],
    [mainLanguage, form.languages],
  );
  const language =
    previewLanguage && languages.includes(previewLanguage) ? previewLanguage : mainLanguage;

  const status = getPublicationStatus({
    isPublished: serverForm?.isPublished,
    responseCount: form.responseCount,
  });
  const readiness = useMemo(() => computeReadiness(form), [form]);

  // Question ids with a validation error, for the red marks in the list; and the error texts
  // translated for the inspector. (`errors` holds i18n keys, see validateFormState.)
  const errorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const key of Object.keys(errors)) {
      const index = /^q-(\d+)/.exec(key)?.[1];
      const id = index === undefined ? undefined : form.questions[Number(index)]?.id;
      if (id) ids.add(id);
    }
    return ids;
  }, [errors, form.questions]);
  const errorTexts = useMemo(
    () => Object.fromEntries(Object.entries(errors).map(([key, value]) => [key, t(value)])),
    [errors, t],
  );

  const select = (id: string) => {
    setSelectedId(id);
    // On a phone the list was a full pane: selecting shows the preview of that question.
    setPane("preview");
  };

  const { maxQuestions } = useDemoLimits();

  const add = (type: QuestionType, index: number) => {
    setSelectedId(addQuestionAtPosition(type, index));
    setPane("settings");
  };

  const duplicate = (index: number) => setSelectedId(duplicateQuestion(index));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= form.questions.length || from === to) return;

    // A condition may only look at an EARLIER question. A move that would break one is refused
    // with the reason; it is never "fixed" by silently rewriting the condition.
    const broken = questionsBrokenByMove(form.questions, from, to);
    if (broken.length > 0) {
      setBlockedMove(broken);
      return;
    }
    moveQuestion(from, to);
  };

  const requestDelete = (index: number) => setPendingDelete(index);
  const deleting = pendingDelete === null ? null : form.questions[pendingDelete];
  const dependents = deleting?.id ? findDependents(form.questions, deleting.id) : [];

  const confirmDelete = () => {
    if (pendingDelete === null || !deleting) return;
    const next = form.questions[pendingDelete + 1] ?? form.questions[pendingDelete - 1];

    // Questions that were shown only by this one lose that condition (they are always shown):
    // stated in the dialog, and done only after the author confirmed.
    if (deleting.id && dependents.length > 0) {
      const id = deleting.id;
      updateForm((prev) => ({ ...prev, questions: clearConditionsOn(prev.questions, id) }));
    }
    deleteQuestion(pendingDelete);
    setSelectedId(next?.id ?? null);
    setPendingDelete(null);
  };

  // Changing a question's type: text, title, description, "required" and the condition stay; the
  // type's own settings (options, config) are replaced by that type's defaults, unless the new type
  // uses the same options. That reset is confirmed first when the question has any.
  const applyType = (type: QuestionType) => {
    if (!question) return;
    const keepOptions = questionTypeUsesOptions(question.type) && questionTypeUsesOptions(type);
    updateQuestion(selectedIndex, {
      type,
      options: keepOptions
        ? question.options
        : createDefaultOptions(type, (number) =>
            type === "MATRIX"
              ? t("builder.editors.matrix.newColumnText", { number })
              : t("builder.editors.options.newOptionText", { number }),
          ),
      config: createDefaultQuestionConfig(type, (number) =>
        t("builder.editors.matrix.newRowText", { number }),
      ),
    });
  };
  const requestTypeChange = (type: QuestionType) => {
    if (!question || type === question.type) return;
    const hasSettings =
      (questionTypeUsesOptions(question.type) && question.options.length > 0) ||
      (questionTypeUsesConfig(question.type) && question.config !== null);
    if (hasSettings) setPendingType(type);
    else applyType(type);
  };

  const onPreview = () => {
    if (status === "published" && serverForm?.shareId) {
      window.open(publicFormUrl(serverForm.shareId), "_blank", "noopener");
    } else {
      // A draft has no public page: "Preview" starts a fresh preview session and shows it.
      setPreviewResetKey((k) => k + 1);
      setPane("preview");
    }
  };

  const paneClass = (name: Pane) => (pane === name ? "flex" : "hidden");

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <BuilderHeader
        formId={formId}
        title={form.title}
        onTitleChange={(title) => updateFormMeta({ title })}
        titleError={errors.title ? t(errors.title) : undefined}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        onSave={() => save()}
        languages={languages}
        previewLanguage={language}
        onPreviewLanguage={setPreviewLanguage}
        isPublished={status === "published"}
        canPublish={readiness.canPublish}
        isPublishing={actions.publish.isPending}
        onPreview={onPreview}
        onPublish={() => actions.publish.mutate()}
      />

      {/* On a phone one pane is shown at a time. */}
      <div
        role="tablist"
        aria-label={t("builder.editor.panes.label")}
        className="flex shrink-0 border-b border-slate-200 bg-white xl:hidden"
      >
        {(["questions", "preview", "settings"] as Pane[]).map((name) => (
          <button
            key={name}
            role="tab"
            type="button"
            aria-selected={pane === name}
            onClick={() => setPane(name)}
            className={`flex-1 border-b-2 px-3 py-2.5 text-sm font-semibold cursor-pointer ${
              pane === name
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500"
            }`}
          >
            {t(`builder.editor.panes.${name}`)}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={`${paneClass("questions")} min-h-0 w-full xl:flex xl:w-auto`}>
          <QuestionSidebar
            questions={form.questions}
            selectedId={selectedId}
            errorIds={errorIds}
            onSelect={select}
            onAdd={add}
            maxQuestions={maxQuestions}
            onDuplicate={duplicate}
            onDelete={requestDelete}
            onMove={move}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
          />
        </div>

        <div className={`${paneClass("preview")} min-h-0 min-w-0 flex-1 xl:flex`}>
          <PreviewWorkspace
            key={previewResetKey}
            form={form}
            selectedId={selectedId}
            language={language}
          />
        </div>

        <div
          className={`${paneClass("settings")} min-h-0 w-full xl:flex xl:w-auto ${pane === "settings" ? "" : "max-xl:hidden"}`}
        >
          <QuestionInspector
            formId={formId}
            form={form}
            question={question}
            index={selectedIndex}
            errors={errorTexts}
            onUpdate={(patch) => updateQuestion(selectedIndex, patch)}
            onChangeType={requestTypeChange}
            onUpdateForm={updateForm}
            collapsed={inspectorCollapsed}
            onToggleCollapsed={() => setInspectorCollapsed((c) => !c)}
          />
        </div>
      </div>

      <ConfirmModal
        isOpen={pendingDelete !== null}
        title={t("builder.editor.deleteModal.title")}
        description={
          dependents.length > 0
            ? t("builder.editor.deleteModal.withDependents", {
                list: dependents
                  .map((q) => q.text || t("builder.editor.sidebar.untitled"))
                  .join(", "),
              })
            : t("builder.editor.deleteModal.description")
        }
        confirmLabel={t("builder.editor.deleteModal.confirm")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
      <ConfirmModal
        isOpen={blockedMove !== null}
        title={t("builder.editor.moveBlocked.title")}
        description={t("builder.editor.moveBlocked.description", {
          list: (blockedMove ?? [])
            .map((q) => q.text || t("builder.editor.sidebar.untitled"))
            .join(", "),
        })}
        confirmLabel={t("builder.editor.moveBlocked.ok")}
        cancelLabel={t("common.close")}
        onCancel={() => setBlockedMove(null)}
        onConfirm={() => setBlockedMove(null)}
      />
      <ConfirmModal
        isOpen={pendingType !== null}
        title={t("builder.editor.typeModal.title")}
        description={t("builder.editor.typeModal.description")}
        confirmLabel={t("builder.editor.typeModal.confirm")}
        onCancel={() => setPendingType(null)}
        onConfirm={() => {
          if (pendingType) applyType(pendingType);
          setPendingType(null);
        }}
      />
    </div>
  );
}

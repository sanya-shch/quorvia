import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useFormBuilder } from "./hooks/useFormBuilder";
import { type AdminForm, type QuestionType, type UpdateFormResult } from "../../types/formBuilder";
import { formsApi } from "../../api/forms";

import Sidebar from "./components/Sidebar";
import InlineAddButton from "./components/InlineAddButton";
import QuestionCard from "./components/QuestionCard";
import ConfirmModal from "../../components/ui/ConfirmModal";

import TextConfigEditor from "./components/editors/TextConfigEditor";
import MatrixConfigEditor from "./components/editors/MatrixConfigEditor";
import NumberConfigEditor from "./components/editors/NumberConfigEditor";
import RatingConfigEditor from "./components/editors/RatingConfigEditor";
import ScaleConfigEditor from "./components/editors/ScaleConfigEditor";
import OptionsConfigEditor from "./components/editors/OptionsConfigEditor";
import BooleanConfigEditor from "./components/editors/BooleanConfigEditor";
import ConditionEditor from "./components/editors/ConditionEditor";
import { calendarIcon } from "../../components/ui/icons";
import { questionTypeUsesConfig, questionTypeUsesOptions } from "./questionConfig";
import LanguageBar from "./components/LanguageBar";
import TranslationPanel from "./components/TranslationPanel";
import {
  getAdditionalLanguages,
  getLanguageName,
  getMainLanguage,
  removeLanguage,
} from "./translations";
import { ErrorInfo } from "../../components/ui/ErrorInfo";
import { getApiErrorCode } from "../../i18n/errorCodes";
import { useToast } from "../../components/ui/Toast";

export default function FormBuilder() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const toast = useToast();
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  // Відкрита вкладка мови: null - основна. Окремо скидати її при завантаженні
  // форми не треба: вкладка мови, якої в формі немає, веде на основну (див. currentLanguage).
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);
  const [languageToRemove, setLanguageToRemove] = useState<string | null>(null);
  // Версія форми, яку редактор зараз тримає (optimistic lock). Зберігається
  // поза станом форми: її зміна не повинна позначати форму "брудною" чи
  // перерисовувати редактор.
  const versionRef = useRef<number | undefined>(undefined);
  const { t, i18n } = useTranslation();

  const {
    form,
    setForm,
    errors,
    trySave,
    isDirty,
    revision,
    resetDirty,
    markSaved,
    updateFormMeta,
    updateForm,
    updateQuestion,
    deleteQuestion,
    duplicateQuestion,
    moveQuestion,
    moveOption,
    addQuestionAtPosition,
  } = useFormBuilder();

  const handleDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index)
      return;

    if (source.droppableId.startsWith("options-")) {
      const questionIndex = parseInt(source.droppableId.split("-")[1], 10);
      moveOption(questionIndex, source.index, destination.index);
      return;
    }

    if (source.droppableId === "sidebar-items" && destination.droppableId === "canvas-questions") {
      const rawType = result.draggableId.split("-")[1] as QuestionType;
      addQuestionAtPosition(rawType, destination.index);
      return;
    }

    if (
      source.droppableId === "canvas-questions" &&
      destination.droppableId === "canvas-questions"
    ) {
      moveQuestion(source.index, destination.index);
    }
  };

  const {
    data: serverForm,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["formAdmin", formId],
    queryFn: () => formsApi.getAdminForm(formId!),
    enabled: !!formId,
    // Редактор не повинен тихо замінювати незбережені правки даними з сервера
    // при поверненні на вкладку; актуальну версію користувач завантажує
    // свідомо (діалог конфлікту).
    refetchOnWindowFocus: false,
  });

  const applyServerForm = useCallback(
    (server: AdminForm) => {
      setForm({
        title: server.title,
        description: server.description || "",
        responseMode: server.responseMode || "ALL_AT_ONCE",
        questions: server.questions || [],
        defaultLanguage: server.defaultLanguage,
        languages: server.languages ?? [],
        translations: server.translations ?? null,
      });
      versionRef.current = server.version;
      resetDirty();
    },
    [setForm, resetDirty],
  );

  useEffect(() => {
    if (serverForm) applyServerForm(serverForm);
  }, [serverForm, applyServerForm]);

  // Змінна мутації - revision: скільки правок було в момент відправки (див.
  // useFormBuilder). Після успіху чистою вважається саме ця ревізія, а не все,
  // що є зараз, тож правки, зроблені під час запиту, лишаються незбереженими.
  const saveMutation = useMutation<UpdateFormResult, unknown, number>({
    mutationFn: () => {
      const normalizedQuestions = form.questions.map((q) => {
        return {
          ...q,
          options: questionTypeUsesOptions(q.type) ? q.options : [],
          config: questionTypeUsesConfig(q.type) ? q.config : null,
        };
      });

      return formsApi.update(formId!, {
        title: form.title,
        description: form.description,
        responseMode: form.responseMode,
        defaultLanguage: form.defaultLanguage,
        languages: form.languages,
        translations: form.translations,
        questions: normalizedQuestions,
        version: versionRef.current,
      });
    },
    onSuccess: (result, revision) => {
      versionRef.current = result.version;
      markSaved(revision);
      toast.success(t("builder.saveSuccess"));
    },
    onError: (error) => {
      if (getApiErrorCode(error) === "FORM_VERSION_CONFLICT") {
        setIsConflictModalOpen(true);
        return;
      }
      toast.error(t("builder.saveError"));
    },
  });

  const handleLoadLatestAfterConflict = async () => {
    setIsConflictModalOpen(false);
    const { data } = await refetch();
    if (data) applyServerForm(data);
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleBackClick = () => {
    if (isDirty) {
      setIsLeaveModalOpen(true);
    } else {
      navigate("/dashboard");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
      </div>
    );
  }

  // const validateForm = (formData: typeof form): string | null => { ... }; -
  // прибрано: логіка валідації тепер живе в useFormBuilder().validate()

  const mainLanguage = getMainLanguage(form);
  // Вкладка, що вже не існує (мову видалили), мовчки веде на основну.
  const currentLanguage =
    activeLanguage && getAdditionalLanguages(form).includes(activeLanguage)
      ? activeLanguage
      : mainLanguage;
  const isTranslating = currentLanguage !== mainLanguage;

  const handleSaveForm = () => {
    trySave(() => {
      saveMutation.mutate(revision);
    });
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-slate-50/50 text-slate-900 flex flex-col">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleBackClick}
              className="group inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <svg
                className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                />
              </svg>
              {t("builder.backToDashboard")}
            </button>

            <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

            <span
              className={`text-xs font-semibold hidden sm:inline-flex items-center gap-1.5 ${
                isDirty
                  ? "text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md"
                  : "text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isDirty ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}
              />
              {isDirty ? t("builder.unsavedChanges") : t("builder.allSaved")}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveForm}
              disabled={!isDirty || saveMutation.isPending}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white cursor-pointer hover:bg-indigo-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              {saveMutation.isPending ? t("builder.saving") : t("builder.saveForm")}
            </button>
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 gap-8">
          {!isTranslating && <Sidebar />}

          <main className="flex-1 min-w-0">
            <LanguageBar
              form={form}
              activeLanguage={currentLanguage}
              onSelect={(language) =>
                setActiveLanguage(language === mainLanguage ? null : language)
              }
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

            {/* Структура форми редагується лише у вкладці основної мови; у режимі
                перекладу її приховано (hidden), а не розмонтовано - стан drag-and-drop
                та фокус не губляться. */}
            <div hidden={isTranslating}>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => updateFormMeta({ title: e.target.value })}
                  className="w-full text-2xl font-bold border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none pb-1 transition-colors"
                  placeholder={t("builder.titlePlaceholder")}
                />
                <textarea
                  value={form.description}
                  onChange={(e) => updateFormMeta({ description: e.target.value })}
                  className="w-full mt-3 text-sm text-slate-600 border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none pb-1 transition-colors resize-none h-10"
                  placeholder={t("builder.descriptionPlaceholder")}
                />

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      {t("builder.responseMode.label")}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {t("builder.responseMode.hint")}
                    </p>
                  </div>
                  <div className="flex gap-1 bg-slate-50 p-0.5 rounded-lg border border-slate-200 shrink-0">
                    {(
                      [
                        { value: "ALL_AT_ONCE", label: t("builder.responseMode.allAtOnce") },
                        { value: "STEP_BY_STEP", label: t("builder.responseMode.stepByStep") },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateFormMeta({ responseMode: opt.value })}
                        aria-pressed={form.responseMode === opt.value}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                          form.responseMode === opt.value
                            ? "bg-indigo-600 text-white"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {errors.title && <ErrorInfo errorText={t(errors.title)} />}
              </div>

              <InlineAddButton onAdd={(type) => addQuestionAtPosition(type, 0)} />

              <Droppable droppableId="canvas-questions" type="QUESTIONS">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`space-y-4 rounded-2xl transition-colors ${
                      snapshot.isDraggingOver
                        ? "bg-slate-100/50 ring-2 ring-dashed ring-slate-200 p-2"
                        : ""
                    }`}
                  >
                    {form.questions.map((question, index) => (
                      <React.Fragment key={question.id || `temp-${index}`}>
                        <Draggable draggableId={question.id || `q-${index}`} index={index}>
                          {(draggableProvided, draggableSnapshot) => (
                            <div
                              ref={draggableProvided.innerRef}
                              {...draggableProvided.draggableProps}
                              className={`transition-shadow ${draggableSnapshot.isDragging ? "shadow-xl" : ""}`}
                            >
                              <QuestionCard
                                question={question}
                                index={index}
                                dragHandleProps={draggableProvided.dragHandleProps}
                                onUpdate={(patch) => updateQuestion(index, patch)}
                                onDelete={() => deleteQuestion(index)}
                                onDuplicate={() => duplicateQuestion(index)}
                                error={errors[`q-${index}`] ? t(errors[`q-${index}`]) : undefined}
                              >
                                <ConditionEditor
                                  condition={question.condition}
                                  currentOrder={question.order}
                                  allQuestions={form.questions}
                                  onChange={(next) => updateQuestion(index, { condition: next })}
                                  error={
                                    errors[`q-${index}-condition`]
                                      ? t(errors[`q-${index}-condition`])
                                      : undefined
                                  }
                                />

                                <hr className="border-slate-100 my-3" />

                                {question.type === "TEXT" && (
                                  <TextConfigEditor
                                    config={question.config}
                                    onChange={(newConfig) =>
                                      updateQuestion(index, { config: newConfig })
                                    }
                                  />
                                )}

                                {question.type === "NUMBER" && (
                                  <NumberConfigEditor
                                    config={question.config}
                                    onChange={(newConfig) =>
                                      updateQuestion(index, { config: newConfig })
                                    }
                                  />
                                )}

                                {(question.type === "CHOICE_SINGLE" ||
                                  question.type === "CHOICE_MULTI" ||
                                  question.type === "RANKING") && (
                                  <OptionsConfigEditor
                                    questionIndex={index}
                                    questionType={question.type}
                                    options={question.options}
                                    displayVariant={question.config?.displayVariant || "list"}
                                    onChangeOptions={(newOptions) =>
                                      updateQuestion(index, { options: newOptions })
                                    }
                                    onChangeDisplayVariant={(variant) =>
                                      updateQuestion(index, {
                                        config: { ...question.config, displayVariant: variant },
                                      })
                                    }
                                  />
                                )}

                                {(question.type === "CHOICE_SINGLE" ||
                                  question.type === "CHOICE_MULTI") &&
                                  question.config?.displayVariant === "dropdown" && (
                                    <div className="mt-2 mb-4 animate-in fade-in duration-150">
                                      <div className="relative w-full max-w-md">
                                        <select
                                          disabled
                                          value={
                                            question.options.find((o) => o.isDefault)?.id || ""
                                          }
                                          className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 pr-10 text-sm font-medium text-slate-700 cursor-not-allowed appearance-none"
                                        >
                                          {!question.options.some((o) => o.isDefault) && (
                                            <option value="">
                                              {t("builder.dropdownPlaceholder")}
                                            </option>
                                          )}

                                          {question.options.map((option) => (
                                            <option key={option.id} value={option.id}>
                                              {option.text || t("builder.emptyOption")}
                                            </option>
                                          ))}
                                        </select>

                                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                                          <svg
                                            className="h-4 w-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            strokeWidth="2"
                                            stroke="currentColor"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                                            />
                                          </svg>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                {question.type === "BOOLEAN" && (
                                  <div className="space-y-4">
                                    <div className="flex items-center gap-3 py-1 text-slate-500">
                                      <div
                                        className={`h-5 w-9 rounded-full p-0.5 flex items-center transition-colors ${
                                          question.config?.defaultValue
                                            ? "bg-indigo-600 justify-end"
                                            : "bg-slate-200 justify-start"
                                        }`}
                                      >
                                        <div className="h-4 w-4 bg-white rounded-full shadow-sm" />
                                      </div>
                                      <span className="text-xs font-medium text-slate-600">
                                        {t("builder.booleanPreview.label")}{" "}
                                        {question.config?.defaultValue
                                          ? t("builder.booleanPreview.on")
                                          : t("builder.booleanPreview.off")}
                                      </span>
                                    </div>

                                    <hr className="border-slate-100" />

                                    <BooleanConfigEditor
                                      config={question.config}
                                      onChange={(newConfig) =>
                                        updateQuestion(index, { config: newConfig })
                                      }
                                    />
                                  </div>
                                )}

                                {question.type === "MATRIX" && (
                                  <MatrixConfigEditor
                                    rows={question.config?.rows ?? []}
                                    columns={question.options}
                                    onChangeRows={(rows) =>
                                      updateQuestion(index, {
                                        config: { ...question.config, rows },
                                      })
                                    }
                                    onChangeColumns={(options) =>
                                      updateQuestion(index, { options })
                                    }
                                  />
                                )}

                                {question.type === "RATING" && (
                                  <RatingConfigEditor
                                    config={question.config}
                                    onChange={(newConfig) =>
                                      updateQuestion(index, { config: newConfig })
                                    }
                                  />
                                )}

                                {question.type === "SCALE" && (
                                  <ScaleConfigEditor
                                    config={question.config}
                                    onChange={(newConfig) =>
                                      updateQuestion(index, { config: newConfig })
                                    }
                                  />
                                )}

                                {question.type === "NPS" && (
                                  <p className="py-2 text-xs text-slate-500 animate-in fade-in duration-150">
                                    {t("builder.editors.nps.hint")}
                                  </p>
                                )}

                                {question.type === "DATE" && (
                                  <div className="flex items-center gap-2 py-2 text-slate-500 text-xs animate-in fade-in duration-150">
                                    {calendarIcon}
                                    <span>{t("builder.datePreview")}</span>
                                  </div>
                                )}
                              </QuestionCard>

                              <InlineAddButton
                                onAdd={(type) => addQuestionAtPosition(type, index + 1)}
                              />
                            </div>
                          )}
                        </Draggable>
                      </React.Fragment>
                    ))}

                    {form.questions.length === 0 && (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 pb-24 text-center mt-4">
                        <p className="text-sm text-slate-500">{t("builder.emptyState")}</p>
                      </div>
                    )}

                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </main>
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
            if (languageToRemove) {
              updateForm((prev) => removeLanguage(prev, languageToRemove));
            }
            setLanguageToRemove(null);
          }}
        />

        <ConfirmModal
          isOpen={isConflictModalOpen}
          title={t("builder.conflictModal.title")}
          description={t("builder.conflictModal.description")}
          confirmLabel={t("builder.conflictModal.confirm")}
          cancelLabel={t("builder.conflictModal.cancel")}
          onCancel={() => setIsConflictModalOpen(false)}
          onConfirm={handleLoadLatestAfterConflict}
        />

        <ConfirmModal
          isOpen={isLeaveModalOpen}
          title={t("builder.leaveModal.title")}
          description={t("builder.leaveModal.description")}
          confirmLabel={t("builder.leaveModal.confirm")}
          cancelLabel={t("builder.leaveModal.cancel")}
          onCancel={() => setIsLeaveModalOpen(false)}
          onConfirm={() => {
            setIsLeaveModalOpen(false);
            navigate("/dashboard");
          }}
        />
      </div>
    </DragDropContext>
  );
}

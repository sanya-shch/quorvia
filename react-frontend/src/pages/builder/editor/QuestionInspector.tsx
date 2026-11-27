import type { ReactNode } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { useTranslation } from "react-i18next";
import AppIcon from "../../../components/ui/AppIcon";
import { ErrorInfo } from "../../../components/ui/ErrorInfo";
import { QUESTION_TYPE_LABEL_KEYS } from "../../../constants";
import type { FormState, Question, QuestionType } from "../../../types/formBuilder";
import BooleanConfigEditor from "../components/editors/BooleanConfigEditor";
import CalculationConfigEditor from "../components/editors/CalculationConfigEditor";
import ConditionEditor from "../components/editors/ConditionEditor";
import FileConfigEditor from "../components/editors/FileConfigEditor";
import ImageOptionsEditor from "../components/editors/ImageOptionsEditor";
import MatrixConfigEditor from "../components/editors/MatrixConfigEditor";
import NumberConfigEditor from "../components/editors/NumberConfigEditor";
import OptionsConfigEditor from "../components/editors/OptionsConfigEditor";
import RatingConfigEditor from "../components/editors/RatingConfigEditor";
import ScaleConfigEditor from "../components/editors/ScaleConfigEditor";
import TextConfigEditor from "../components/editors/TextConfigEditor";
import QuestionScoringEditor from "../components/QuestionScoringEditor";
import QuestionTranslations from "./QuestionTranslations";
import { AVAILABLE_TYPES } from "./questionTypeMeta";

interface QuestionInspectorProps {
  formId: string;
  form: FormState;
  question: Question | null;
  index: number;
  // Validation error texts (already translated) by key, as the builder produces them.
  errors: Record<string, string>;
  onUpdate: (patch: Partial<Question>) => void;
  onChangeType: (type: QuestionType) => void;
  onUpdateForm: (updater: (prev: FormState) => FormState) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const field =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 px-5 py-5 first:border-t-0">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

// The right column: everything about the selected question. It reuses the editors the stacked
// cards used (options, validation, conditions, scoring), so every setting of the old builder is
// still here; only the place changed.
export default function QuestionInspector({
  formId,
  form,
  question,
  index,
  errors,
  onUpdate,
  onChangeType,
  onUpdateForm,
  collapsed,
  onToggleCollapsed,
}: QuestionInspectorProps) {
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <section
        aria-label={t("builder.editor.inspector.title")}
        className="hidden w-14 shrink-0 flex-col items-center border-l border-slate-200 bg-white py-3 xl:flex"
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={t("builder.editor.inspector.expand")}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 cursor-pointer"
        >
          <AppIcon name="panel" className="h-5 w-5" />
        </button>
      </section>
    );
  }

  const header = (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {t("builder.editor.inspector.title")}
        </p>
        {question && (
          <p className="mt-0.5 flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="truncate">{t(QUESTION_TYPE_LABEL_KEYS[question.type])}</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-500">
              {String(index + 1).padStart(2, "0")}
            </span>
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={t("builder.editor.inspector.collapse")}
        className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 xl:block cursor-pointer"
      >
        <AppIcon name="panel" className="h-5 w-5" />
      </button>
    </div>
  );

  if (!question) {
    return (
      <section
        aria-label={t("builder.editor.inspector.title")}
        className="flex h-full min-h-0 w-full flex-col bg-white xl:w-[340px] xl:shrink-0 xl:border-l xl:border-slate-200"
      >
        {header}
        <p className="p-8 text-center text-sm text-slate-500">
          {t("builder.editor.inspector.empty")}
        </p>
      </section>
    );
  }

  // Changing the type of a question that already has answers would make them unreadable (a
  // text answer is not a rating), so it is only offered while the form has no responses.
  const typeLocked = (form.responseCount ?? 0) > 0;
  const update = (patch: Partial<Question>) => onUpdate(patch);
  const configChange = (config: Question["config"]) => update({ config });

  const typeSettings = (() => {
    switch (question.type) {
      case "TEXT":
        return <TextConfigEditor config={question.config} onChange={configChange} />;
      case "NUMBER":
        return <NumberConfigEditor config={question.config} onChange={configChange} />;
      case "BOOLEAN":
        return <BooleanConfigEditor config={question.config} onChange={configChange} />;
      case "IMAGE_CHOICE":
        return (
          <ImageOptionsEditor
            formId={formId}
            options={question.options}
            onChange={(options) => update({ options })}
          />
        );
      case "CHOICE_SINGLE":
      case "CHOICE_MULTI":
      case "RANKING":
        // The options list is reorderable: it needs its own drag context here (it used to share
        // the page's), and reordering is the only drop it has to handle.
        return (
          <DragDropContext
            onDragEnd={(result: DropResult) => {
              if (!result.destination || result.destination.index === result.source.index) return;
              const options = [...question.options];
              const [moved] = options.splice(result.source.index, 1);
              options.splice(result.destination.index, 0, moved);
              update({ options });
            }}
          >
            <OptionsConfigEditor
              questionIndex={index}
              questionType={question.type}
              options={question.options}
              displayVariant={question.config?.displayVariant || "list"}
              onChangeOptions={(options) => update({ options })}
              onChangeDisplayVariant={(variant) =>
                update({ config: { ...question.config, displayVariant: variant } })
              }
            />
          </DragDropContext>
        );
      case "MATRIX":
        return (
          <MatrixConfigEditor
            rows={question.config?.rows ?? []}
            columns={question.options}
            onChangeRows={(rows) => update({ config: { ...question.config, rows } })}
            onChangeColumns={(options) => update({ options })}
          />
        );
      case "FILE":
        return <FileConfigEditor config={question.config} onChange={configChange} />;
      case "CALCULATION":
        return (
          <CalculationConfigEditor
            question={question}
            allQuestions={form.questions}
            onChange={configChange}
            error={errors[`q-${index}-formula`]}
          />
        );
      case "RATING":
        return <RatingConfigEditor config={question.config} onChange={configChange} />;
      case "SCALE":
        return <ScaleConfigEditor config={question.config} onChange={configChange} />;
      case "NPS":
        return <p className="text-xs text-slate-500">{t("builder.editors.nps.hint")}</p>;
      case "DATE":
        return <p className="text-xs text-slate-500">{t("builder.datePreview")}</p>;
      default:
        return null;
    }
  })();

  return (
    <section
      aria-label={t("builder.editor.inspector.title")}
      className="flex h-full min-h-0 w-full flex-col bg-white xl:w-[340px] xl:shrink-0 xl:border-l xl:border-slate-200"
    >
      {header}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title={t("builder.editor.inspector.general")}>
          <div>
            <label htmlFor="inspector-type" className="block text-sm font-semibold text-slate-700">
              {t("builder.editor.inspector.type")}
            </label>
            <select
              id="inspector-type"
              value={question.type}
              disabled={typeLocked}
              aria-describedby={typeLocked ? "inspector-type-hint" : undefined}
              onChange={(e) => onChangeType(e.target.value as QuestionType)}
              className={`${field} mt-1.5 disabled:bg-slate-50 disabled:text-slate-500`}
            >
              {AVAILABLE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(QUESTION_TYPE_LABEL_KEYS[type])}
                </option>
              ))}
            </select>
            {typeLocked && (
              <p id="inspector-type-hint" className="mt-1 text-xs text-slate-500">
                {t("builder.editor.inspector.typeLocked")}
              </p>
            )}
          </div>

          <label className="block text-sm font-semibold text-slate-700">
            {t("builder.editor.inspector.questionTitle")}
            <textarea
              rows={2}
              value={question.text}
              onChange={(e) => update({ text: e.target.value })}
              placeholder={t("builder.questionCard.textPlaceholder")}
              aria-invalid={Boolean(errors[`q-${index}`])}
              className={`${field} mt-1.5 resize-y`}
            />
            {errors[`q-${index}`] && <ErrorInfo errorText={errors[`q-${index}`]} />}
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            {t("builder.editor.inspector.description")}{" "}
            <span className="font-normal text-slate-500">
              {t("builder.editor.inspector.optional")}
            </span>
            <textarea
              rows={2}
              value={question.description || ""}
              onChange={(e) => update({ description: e.target.value })}
              placeholder={t("builder.questionCard.descriptionPlaceholder")}
              className={`${field} mt-1.5 resize-y`}
            />
          </label>

          {/* A calculation is computed, so there is nothing to require. */}
          {question.type !== "CALCULATION" && (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3">
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  {t("builder.editor.inspector.required")}
                </span>
                <span className="block text-xs text-slate-500">
                  {t("builder.editor.inspector.requiredHint")}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={question.required}
                onChange={(e) => update({ required: e.target.checked })}
                className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-slate-200 transition-colors checked:bg-indigo-600 relative before:absolute before:left-0.5 before:top-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4"
              />
            </label>
          )}
        </Section>

        {typeSettings && (
          <Section title={t("builder.editor.inspector.settings")}>{typeSettings}</Section>
        )}

        {form.scoring?.enabled && (
          <Section title={t("builder.editor.inspector.scoring")}>
            <QuestionScoringEditor
              question={question}
              onChange={update}
              error={errors[`q-${index}-score`]}
            />
          </Section>
        )}

        <Section title={t("builder.editor.inspector.logic")}>
          <ConditionEditor
            condition={question.condition}
            currentOrder={question.order}
            allQuestions={form.questions}
            onChange={(next) => update({ condition: next })}
            error={errors[`q-${index}-condition`]}
          />
        </Section>

        <Section title={t("builder.editor.inspector.translations.title")}>
          <QuestionTranslations
            form={form}
            questionIndex={index}
            onChange={onUpdateForm}
            settingsHref={`/forms/${formId}/settings#settings-languages`}
          />
        </Section>
      </div>
    </section>
  );
}

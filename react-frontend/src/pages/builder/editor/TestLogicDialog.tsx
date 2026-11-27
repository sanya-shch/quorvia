import { useMemo, useState } from "react";
import { resolveVisibleQuestionIds, validateConditionGraph } from "@quorvia/condition-engine";
import { questionTypeSupportsConditions } from "@quorvia/shared-types";
import { useTranslation } from "react-i18next";
import Dialog from "../../../components/ui/Dialog";
import type { Question } from "../../../types/formBuilder";

interface TestLogicDialogProps {
  questions: Question[];
  selectedId: string | null;
  onClose: () => void;
}

type TestAnswers = Record<string, unknown>;

// A sandbox for the form's branching: pick values for the questions that conditions look at and
// see which questions would be shown. It uses the condition-engine (resolveVisibleQuestionIds,
// validateConditionGraph), the evaluator the public form and the server use, so the result is
// exactly what a respondent with those answers would get. Nothing is saved.
export default function TestLogicDialog({ questions, selectedId, onClose }: TestLogicDialogProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<TestAnswers>({});

  const withIds = useMemo(
    () => questions.map((q, order) => ({ ...q, id: q.id ?? `q-${order}`, order })),
    [questions],
  );
  const sourceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const q of withIds) for (const rule of q.condition?.rules ?? []) ids.add(rule.questionId);
    return [...ids];
  }, [withIds]);
  const sources = withIds.filter(
    (q) => sourceIds.includes(q.id) && questionTypeSupportsConditions(q.type),
  );

  const visible = useMemo(() => resolveVisibleQuestionIds(withIds, answers), [withIds, answers]);
  const graph = useMemo(() => validateConditionGraph(withIds), [withIds]);
  const selected = withIds.find((q) => q.id === selectedId);

  const set = (id: string, value: unknown) =>
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined || value === "") delete next[id];
      else next[id] = value;
      return next;
    });

  const control = (q: (typeof withIds)[number]) => {
    const common = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm";
    switch (q.type) {
      case "CHOICE_SINGLE":
      case "IMAGE_CHOICE":
        return (
          <select
            value={String(answers[q.id] ?? "")}
            onChange={(e) => set(q.id, e.target.value)}
            className={common}
          >
            <option value="">{t("builder.editor.testLogic.noAnswer")}</option>
            {q.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.text || t("builder.emptyOption")}
              </option>
            ))}
          </select>
        );
      case "CHOICE_MULTI":
        return (
          <div className="space-y-1">
            {q.options.map((o) => {
              const current = (answers[q.id] as string[] | undefined) ?? [];
              return (
                <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={current.includes(o.id)}
                    onChange={(e) =>
                      set(
                        q.id,
                        e.target.checked ? [...current, o.id] : current.filter((id) => id !== o.id),
                      )
                    }
                  />
                  {o.text || t("builder.emptyOption")}
                </label>
              );
            })}
          </div>
        );
      case "BOOLEAN":
        return (
          <select
            value={answers[q.id] === undefined ? "" : String(answers[q.id])}
            onChange={(e) =>
              set(q.id, e.target.value === "" ? undefined : e.target.value === "true")
            }
            className={common}
          >
            <option value="">{t("builder.editor.testLogic.noAnswer")}</option>
            <option value="true">{t("builder.editor.testLogic.yes")}</option>
            <option value="false">{t("builder.editor.testLogic.no")}</option>
          </select>
        );
      case "NUMBER":
        return (
          <input
            type="number"
            value={answers[q.id] === undefined ? "" : String(answers[q.id])}
            onChange={(e) => set(q.id, e.target.value === "" ? undefined : Number(e.target.value))}
            className={common}
          />
        );
      default:
        return (
          <input
            type="text"
            value={String(answers[q.id] ?? "")}
            onChange={(e) => set(q.id, e.target.value)}
            className={common}
          />
        );
    }
  };

  return (
    <Dialog
      title={t("builder.editor.testLogic.title")}
      description={t("builder.editor.testLogic.description")}
      onClose={onClose}
      closeLabel={t("common.close")}
      width="lg"
    >
      {!graph.valid && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          <p className="font-semibold">{t("builder.editor.testLogic.invalid")}</p>
          <ul className="mt-1 list-disc pl-5">
            {graph.errors.map((error, i) => (
              <li key={i}>
                {t(`conditionErrors.${error.reason}`)}:{" "}
                {withIds.find((q) => q.id === error.questionId)?.text || error.questionId}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected?.condition && (
        <p className="mb-4 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
          <b>{selected.text || t("builder.editor.sidebar.untitled")}</b>:{" "}
          {t("builder.editor.testLogic.selectedRules", {
            count: selected.condition.rules.length,
            logic: selected.condition.logic,
          })}
        </p>
      )}

      {sources.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          {t("builder.editor.testLogic.noConditions")}
        </p>
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("builder.editor.testLogic.values")}
          </h3>
          {sources.map((q) => (
            <div key={q.id} className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                <span className="mr-1.5 text-indigo-600">#{q.order + 1}</span>
                {q.text || t("builder.editor.sidebar.untitled")}
              </p>
              {control(q)}
            </div>
          ))}
        </div>
      )}

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t("builder.editor.testLogic.result", { shown: visible.size, total: withIds.length })}
      </h3>
      <ol className="mt-2 space-y-1">
        {withIds.map((q) => {
          const shown = visible.has(q.id);
          return (
            <li
              key={q.id}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-sm ${
                shown
                  ? "bg-emerald-50 text-emerald-900"
                  : "bg-slate-100 text-slate-500 line-through"
              }`}
            >
              <span className="min-w-0 truncate">
                <b className="mr-1.5">#{q.order + 1}</b>
                {q.text || t("builder.editor.sidebar.untitled")}
              </span>
              <span className="shrink-0 text-xs font-semibold no-underline">
                {shown ? t("builder.editor.testLogic.shown") : t("builder.editor.testLogic.hidden")}
              </span>
            </li>
          );
        })}
      </ol>
    </Dialog>
  );
}

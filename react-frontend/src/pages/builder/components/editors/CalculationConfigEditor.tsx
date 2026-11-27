import { useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FORMULA_FUNCTIONS,
  formulaToShown,
  referenceLabels,
  shownToFormula,
} from "@quorvia/calculation-engine";
import {
  CALCULATION_LIMITS,
  CALCULATION_RESULT_TYPES,
  type CalculationResultType,
} from "@quorvia/shared-types";
import type { Question, QuestionConfig } from "../../../../types/formBuilder";
import {
  checkCalculation,
  referenceableQuestions,
  runCalculationTest,
  testInputQuestions,
  type TestAnswers,
} from "../../calculation";

interface CalculationConfigEditorProps {
  question: Question;
  // Every question of the form: the formula reads some of them.
  allQuestions: Question[];
  onChange: (config: QuestionConfig) => void;
  // The problem found when the form was last saved (a translation key).
  error?: string;
}

const inputClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const labelClass = "text-xs font-semibold text-slate-500";

export default function CalculationConfigEditor({
  question,
  allQuestions,
  onChange,
  error,
}: CalculationConfigEditorProps) {
  const { t } = useTranslation();
  const ids = { formula: useId(), insert: useId(), result: useId(), decimals: useId() };
  const textarea = useRef<HTMLTextAreaElement>(null);
  // Where the author's cursor was last in the formula: choosing a question moves the focus to the
  // list, so the position has to be remembered. Never focused: the end of the formula.
  const cursor = useRef<{ start: number; end: number } | null>(null);
  const rememberCursor = (area: HTMLTextAreaElement) => {
    cursor.current = { start: area.selectionStart, end: area.selectionEnd };
  };
  const config: QuestionConfig = question.config ?? {};
  const formula = config.formula ?? "";
  const resultType: CalculationResultType = config.resultType ?? "number";

  // The questions a formula can read, with the names the author sees for them.
  const sources = useMemo(
    () => referenceableQuestions(allQuestions, question.id),
    [allQuestions, question.id],
  );
  const labels = useMemo(
    () =>
      referenceLabels(
        // The numbering counts every question, so "Untitled 4" is the 4th card of the form.
        allQuestions.flatMap((q, index) =>
          q.id ? [{ id: q.id, text: q.text, position: index + 1 }] : [],
        ),
        (n) => t("builder.editors.condition.untitledQuestion") + ` ${n}`,
      ),
    [allQuestions, t],
  );
  const shown = useMemo(() => formulaToShown(formula, labels), [formula, labels]);
  const problem = useMemo(
    () => (formula.trim() === "" ? null : checkCalculation(question, allQuestions)),
    [formula, question, allQuestions],
  );

  const patch = (next: Partial<QuestionConfig>) => onChange({ ...config, ...next });
  const setShown = (text: string) => patch({ formula: shownToFormula(text, labels) });

  // Puts `text` where the cursor is (replacing the selection) and puts the cursor `back`
  // characters before the end of what was inserted.
  const insert = (text: string, back = 0) => {
    const area = textarea.current;
    const start = Math.min(cursor.current?.start ?? shown.text.length, shown.text.length);
    const end = Math.min(cursor.current?.end ?? shown.text.length, shown.text.length);
    const next = shown.text.slice(0, start) + text + shown.text.slice(end);
    const after = start + text.length - back;

    setShown(next);
    cursor.current = { start: after, end: after };

    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(after, after);
    });
  };

  const label = (id: string): string => labels.labelById.get(id) ?? id;

  const range = problem
    ? {
        from: shown.mapPosition(problem.pos),
        to: Math.max(shown.mapPosition(problem.end, true), shown.mapPosition(problem.pos) + 1),
      }
    : null;

  return (
    <div className="space-y-4 motion-fade-in">
      <div className="space-y-1.5">
        <label htmlFor={ids.formula} className={labelClass}>
          {t("builder.editors.calculation.formula")}
        </label>
        <textarea
          id={ids.formula}
          ref={textarea}
          value={shown.text}
          onChange={(e) => {
            rememberCursor(e.target);
            setShown(e.target.value);
          }}
          onSelect={(e) => rememberCursor(e.currentTarget)}
          rows={3}
          spellCheck={false}
          maxLength={CALCULATION_LIMITS.formula * 2}
          placeholder={t("builder.editors.calculation.formulaPlaceholder")}
          aria-invalid={problem || error ? true : undefined}
          aria-describedby={`${ids.formula}-hint`}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-800 placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p id={`${ids.formula}-hint`} className="text-[11px] text-slate-500">
          {t("builder.editors.calculation.formulaHint")}
        </p>

        {problem && range && (
          <div role="alert" className="space-y-1 rounded-lg bg-rose-50 px-3 py-2">
            <p className="text-xs font-medium text-rose-700">
              {t(problem.messageKey)}
              {problem.pos > 0 && (
                <span className="font-normal text-rose-700">
                  {" · "}
                  {t("builder.editors.calculation.position", { position: range.from + 1 })}
                </span>
              )}
            </p>
            {problem.pos > 0 || problem.end > problem.pos ? (
              <code className="block overflow-x-auto whitespace-pre text-xs text-slate-600">
                {shown.text.slice(0, range.from)}
                <mark className="rounded bg-rose-200 px-0.5 text-rose-900">
                  {shown.text.slice(range.from, range.to) || " "}
                </mark>
                {shown.text.slice(range.to)}
              </code>
            ) : null}
          </div>
        )}
        {!problem && error && (
          <p role="alert" className="text-xs font-medium text-rose-700">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.insert} className={labelClass}>
            {t("builder.editors.calculation.insertQuestion")}
          </label>
          <select
            id={ids.insert}
            value=""
            disabled={sources.length === 0}
            onChange={(e) => e.target.value && insert(`[[${label(e.target.value)}]]`)}
            className={`${inputClass} min-w-[12rem] max-w-[18rem]`}
          >
            <option value="">
              {sources.length === 0
                ? t("builder.editors.calculation.noQuestions")
                : t("builder.editors.calculation.insertQuestionPlaceholder")}
            </option>
            {sources.map((q) => (
              <option key={q.id} value={q.id}>
                {label(q.id)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={ids.result} className={labelClass}>
            {t("builder.editors.calculation.resultType.label")}
          </label>
          <select
            id={ids.result}
            value={resultType}
            onChange={(e) => patch({ resultType: e.target.value as CalculationResultType })}
            className={inputClass}
          >
            {CALCULATION_RESULT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`builder.editors.calculation.resultType.${type}`)}
              </option>
            ))}
          </select>
        </div>

        {resultType === "number" && (
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.decimals} className={labelClass}>
              {t("builder.editors.calculation.decimals")}
            </label>
            <input
              id={ids.decimals}
              type="number"
              min={CALCULATION_LIMITS.decimals.min}
              max={CALCULATION_LIMITS.decimals.max}
              step={1}
              value={config.decimals ?? CALCULATION_LIMITS.decimals.default}
              onChange={(e) => {
                const value = Number(e.target.value);

                if (e.target.value !== "" && Number.isInteger(value)) {
                  patch({
                    decimals: Math.min(
                      CALCULATION_LIMITS.decimals.max,
                      Math.max(CALCULATION_LIMITS.decimals.min, value),
                    ),
                  });
                }
              }}
              className={`${inputClass} w-20`}
            />
          </div>
        )}

        {resultType !== "boolean" && (
          <>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>{t("builder.editors.calculation.prefix")}</span>
              <input
                type="text"
                value={config.prefix ?? ""}
                maxLength={CALCULATION_LIMITS.affix}
                placeholder={t("builder.editors.calculation.prefixPlaceholder")}
                onChange={(e) => patch({ prefix: e.target.value })}
                className={`${inputClass} w-24`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>{t("builder.editors.calculation.suffix")}</span>
              <input
                type="text"
                value={config.suffix ?? ""}
                maxLength={CALCULATION_LIMITS.affix}
                placeholder={t("builder.editors.calculation.suffixPlaceholder")}
                onChange={(e) => patch({ suffix: e.target.value })}
                className={`${inputClass} w-24`}
              />
            </label>
          </>
        )}
      </div>

      <details className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-600">
          {t("builder.editors.calculation.functions.title")}
        </summary>
        <p className="mt-2 text-[11px] text-slate-500">
          {t("builder.editors.calculation.functions.hint")}
        </p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {[...FORMULA_FUNCTIONS.keys()].map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => insert(`${name}()`, 1)}
                title={t(`builder.editors.calculation.functions.items.${name}.description`)}
                className="w-full cursor-pointer rounded-lg px-2 py-1 text-left hover:bg-white"
              >
                <code className="text-xs font-semibold text-indigo-700">
                  {t(`builder.editors.calculation.functions.items.${name}.signature`)}
                </code>
                <span className="block text-[11px] text-slate-500">
                  {t(`builder.editors.calculation.functions.items.${name}.description`)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t("builder.editors.calculation.display.label")}</span>
          <select
            value={config.display ?? "visible"}
            onChange={(e) => patch({ display: e.target.value as "visible" | "hidden" })}
            className={inputClass}
          >
            <option value="visible">{t("builder.editors.calculation.display.visible")}</option>
            <option value="hidden">{t("builder.editors.calculation.display.hidden")}</option>
          </select>
        </label>

        <div className="flex flex-col gap-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-500">
            <input
              type="checkbox"
              checked={config.emptyAsZero !== false}
              onChange={(e) => patch({ emptyAsZero: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            {t("builder.editors.calculation.emptyAsZero.label")}
          </label>
          <p className="text-[11px] text-slate-500">
            {t("builder.editors.calculation.emptyAsZero.hint")}
          </p>
        </div>
      </div>

      {question.id && <PlaceholderHint questionId={question.id} />}

      <TestPanel
        question={question}
        allQuestions={allQuestions}
        blocked={formula.trim() === "" || problem !== null}
        label={label}
      />
    </div>
  );
}

// `{{calc:<id>}}` for the text of an end screen.
function PlaceholderHint({ questionId }: { questionId: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const text = `{{calc:${questionId}}}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard access: the text is selectable.
    }
  };

  return (
    <div className="space-y-1">
      <p className={labelClass}>{t("builder.editors.calculation.placeholder.label")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="select-all break-all rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
          {text}
        </code>
        <button
          type="button"
          onClick={copy}
          className="cursor-pointer text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
        >
          {copied
            ? t("builder.editors.calculation.placeholder.copied")
            : t("builder.editors.calculation.placeholder.copy")}
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        {t("builder.editors.calculation.placeholder.hint")}
      </p>
    </div>
  );
}

interface TestPanelProps {
  question: Question;
  allQuestions: Question[];
  blocked: boolean;
  label: (id: string) => string;
}

// Sample answers for the questions the formula reads and the result the server would compute.
function TestPanel({ question, allQuestions, blocked, label }: TestPanelProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<TestAnswers>({});
  const inputs = useMemo(
    () => (blocked ? [] : testInputQuestions(question, allQuestions)),
    [blocked, question, allQuestions],
  );
  const result = useMemo(
    () => (blocked ? null : runCalculationTest(question, allQuestions, answers)),
    [blocked, question, allQuestions, answers],
  );
  const set = (id: string, value: unknown) => setAnswers((prev) => ({ ...prev, [id]: value }));

  return (
    <details className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-600">
        {t("builder.editors.calculation.test.title")}
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-[11px] text-slate-500">{t("builder.editors.calculation.test.hint")}</p>

        {blocked && (
          <p className="text-xs text-slate-500">{t("builder.editors.calculation.test.fixFirst")}</p>
        )}

        {!blocked && inputs.length === 0 && (
          <p className="text-xs text-slate-500">{t("builder.editors.calculation.test.noInputs")}</p>
        )}

        {inputs.map((input) => (
          <TestInput
            key={input.id}
            question={input}
            name={label(input.id)}
            value={answers[input.id]}
            onChange={(value) => set(input.id, value)}
          />
        ))}

        {result && (
          <div role="status" className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <span className="text-xs font-semibold text-slate-500">
              {t("builder.editors.calculation.test.result")}:{" "}
            </span>
            <span className="text-sm font-semibold text-slate-800">
              {result.text ?? t("builder.editors.calculation.test.noValue")}
            </span>
            {result.error && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                {t(`builder.editors.calculation.test.evalErrors.${result.error}`)}
              </p>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

interface TestInputProps {
  question: Question & { id: string };
  name: string;
  value: unknown;
  onChange: (value: unknown) => void;
}

function TestInput({ question, name, value, onChange }: TestInputProps) {
  const { t } = useTranslation();
  const id = useId();

  if (question.type === "CHOICE_MULTI") {
    const picked = Array.isArray(value) ? (value as string[]) : [];

    return (
      <fieldset className="space-y-1">
        <legend className={labelClass}>{name}</legend>
        <div className="flex flex-wrap gap-2">
          {question.options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700"
            >
              <input
                type="checkbox"
                checked={picked.includes(option.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...picked, option.id]
                      : picked.filter((x) => x !== option.id),
                  )
                }
                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
              />
              {option.text || t("builder.emptyOption")}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (question.type === "CHOICE_SINGLE" || question.type === "IMAGE_CHOICE") {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className={labelClass}>
          {name}
        </label>
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
          className={`${inputClass} max-w-[18rem]`}
        >
          <option value="">{t("builder.editors.calculation.test.notChosen")}</option>
          {question.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.text || t("builder.emptyOption")}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (question.type === "BOOLEAN") {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className={labelClass}>
          {name}
        </label>
        <select
          id={id}
          value={typeof value === "boolean" ? String(value) : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "true")}
          className={`${inputClass} w-40`}
        >
          <option value="">{t("builder.editors.calculation.test.notChosen")}</option>
          <option value="true">{t("builder.editors.calculation.test.yes")}</option>
          <option value="false">{t("builder.editors.calculation.test.no")}</option>
        </select>
      </div>
    );
  }

  if (question.type === "TEXT") {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className={labelClass}>
          {name}
        </label>
        <input
          id={id}
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
          className={`${inputClass} max-w-[18rem]`}
        />
      </div>
    );
  }

  // NUMBER, RATING, SCALE, NPS
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {name}
      </label>
      <input
        id={id}
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className={`${inputClass} w-32`}
      />
    </div>
  );
}

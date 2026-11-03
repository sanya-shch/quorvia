import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  assertNever,
  getOtherOption,
  getScaleBounds,
  isOtherSelected,
  OTHER_ANSWER_MAX_LENGTH,
} from "@quorvia/shared-types";
import ScaleField from "./ScaleField";
import NumberSlider from "./NumberSlider";
import { type Question } from "../../../types/formBuilder";
import { type AnswerValue } from "../../../types/formViewer";

interface QuestionControlProps {
  question: Question;
  qId: string;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
}

interface QuestionFieldProps extends QuestionControlProps {
  /** Текст варіанта «Інше» (answers[otherAnswerKey(qId)]). */
  otherValue?: AnswerValue;
  onOtherChange?: (text: string) => void;
}

function QuestionControl({
  question,
  qId,
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
}: QuestionControlProps) {
  const { t } = useTranslation();
  const displayVariant = question.config?.displayVariant || "list";

  if (question.type === "TEXT") {
    return question.config?.variant === "textarea" ? (
      <textarea
        id={qId}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-[100px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none placeholder-slate-400"
        placeholder={t("viewer.textareaPlaceholder")}
      />
    ) : (
      <input
        id={qId}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        type={question.config?.variant === "email" ? "email" : "text"}
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none placeholder-slate-400"
        placeholder={t("viewer.textInputPlaceholder")}
      />
    );
  }

  if (question.type === "RATING" || question.type === "SCALE" || question.type === "NPS") {
    const { min, max } = getScaleBounds(question.type, question.config);

    return (
      <ScaleField
        name={qId}
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        variant={question.type === "RATING" ? "stars" : "numbers"}
        required={question.required}
        labelledBy={labelledBy}
        describedBy={describedBy}
        invalid={invalid}
        minLabel={
          question.type === "NPS" ? t("viewer.scale.npsLow") : question.config?.minLabel || undefined
        }
        maxLabel={
          question.type === "NPS"
            ? t("viewer.scale.npsHigh")
            : question.config?.maxLabel || undefined
        }
      />
    );
  }

  if (question.type === "NUMBER") {
    const { numberVariant, min, max, step } = question.config ?? {};

    if (numberVariant === "slider" && min !== undefined && max !== undefined && min < max) {
      return (
        <NumberSlider
          id={qId}
          min={min}
          max={max}
          step={step ?? 1}
          value={value}
          onChange={onChange}
          required={question.required}
          labelledBy={labelledBy}
          describedBy={describedBy}
          invalid={invalid}
        />
      );
    }

    return (
      <input
        id={qId}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        type="number"
        value={value !== undefined && value !== "" ? (value as number) : ""}
        onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : "")}
        className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
        placeholder="0"
      />
    );
  }

  if (question.type === "BOOLEAN") {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={!!value}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          onClick={() => onChange(!(value as boolean))}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
            value ? "bg-indigo-600" : "bg-slate-200"
          }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              value ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span aria-hidden="true" className="text-sm font-medium text-slate-600">
          {value ? t("viewer.stepper.booleanYes") : t("viewer.stepper.booleanNo")}
        </span>
      </div>
    );
  }

  if (question.type === "CHOICE_SINGLE") {
    if (displayVariant === "tabs") {
      return (
        <div
          role="radiogroup"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          className="flex flex-wrap gap-2"
        >
          {question.options.map((option) => {
            const isSelected = value === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onChange(option.id)}
                className={`px-4 py-2 text-sm font-semibold rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                  isSelected
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                }`}
              >
                {option.text}
              </button>
            );
          })}
        </div>
      );
    }

    if (displayVariant === "dropdown") {
      return (
        <div className="relative">
          <select
            id={qId}
            value={(value as string) || ""}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm font-medium text-slate-700 focus:border-indigo-500 focus:outline-none appearance-none cursor-pointer"
          >
            <option value="">{t("builder.editors.condition.chooseOption")}</option>
            {question.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.text}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>
      );
    }

    return (
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className="flex flex-col gap-2.5"
      >
        {question.options.map((option) => (
          <label
            key={option.id}
            className={`flex items-center gap-3 border rounded-xl p-3 text-sm font-medium cursor-pointer transition-all ${
              value === option.id
                ? "bg-indigo-50/50 border-indigo-200 text-indigo-900"
                : "bg-slate-50 border-slate-200/60 text-slate-700 hover:bg-slate-100/70"
            }`}
          >
            <input
              type="radio"
              name={qId}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className="h-4 w-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
            />
            {option.text}
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "CHOICE_MULTI") {
    const toggle = (optionId: string) => {
      const current = (value as string[]) || [];
      onChange(
        current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      );
    };

    if (displayVariant === "tabs") {
      return (
        <div
          role="group"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          className="flex flex-wrap gap-2"
        >
          {question.options.map((option) => {
            const isSelected = ((value as string[]) || []).includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => toggle(option.id)}
                className={`px-4 py-2 text-sm font-semibold rounded-xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                  isSelected
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.text}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <div
        role="group"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className="flex flex-col gap-2.5"
      >
        {question.options.map((option) => {
          const isChecked = ((value as string[]) || []).includes(option.id);
          return (
            <label
              key={option.id}
              className={`flex items-center gap-3 border rounded-xl p-3 text-sm font-medium cursor-pointer transition-all ${
                isChecked
                  ? "bg-indigo-50/50 border-indigo-200 text-indigo-900"
                  : "bg-slate-50 border-slate-200/60 text-slate-700 hover:bg-slate-100/70"
              }`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(option.id)}
                className="h-4 w-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
              />
              {option.text}
            </label>
          );
        })}
      </div>
    );
  }

  if (question.type === "DATE") {
    return (
      <input
        id={qId}
        type="date"
        value={(value as string) || ""}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
      />
    );
  }

  // Усі типи питань оброблені вище: тут question.type має звузитись до never.
  // Новий тип у QUESTION_TYPES без власної гілки зламає компіляцію.
  return assertNever(question.type, "question type");
}

/**
 * Поле відповіді + (для питань із варіантом «Інше») текстове поле, яке
 * з'являється, коли «Інше» обрано. Саме керування (QuestionControl) про
 * «Інше» нічого не знає - так варіанти list/tabs/dropdown не дублюють логіку.
 */
export default function QuestionField({
  otherValue,
  onOtherChange,
  ...controlProps
}: QuestionFieldProps) {
  const { t } = useTranslation();
  const { question, qId, value, describedBy, invalid } = controlProps;
  const showOther = isOtherSelected(question.type, question.options, value);
  const inputRef = useRef<HTMLInputElement>(null);
  // Фокус на поле лише коли воно щойно з'явилось через вибір, а не при першому
  // рендері (напр. після повернення на крок зі вже обраним «Інше»).
  const wasShown = useRef(showOther);

  useEffect(() => {
    if (showOther && !wasShown.current) inputRef.current?.focus();
    wasShown.current = showOther;
  }, [showOther]);

  if (!getOtherOption(question.options)) {
    return <QuestionControl {...controlProps} />;
  }

  return (
    <div className="space-y-3">
      <QuestionControl {...controlProps} />

      {showOther && (
        <input
          ref={inputRef}
          id={`${qId}-other`}
          type="text"
          maxLength={OTHER_ANSWER_MAX_LENGTH}
          value={typeof otherValue === "string" ? otherValue : ""}
          onChange={(e) => onOtherChange?.(e.target.value)}
          aria-label={t("viewer.otherAriaLabel")}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          placeholder={t("viewer.otherPlaceholder")}
          className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
        />
      )}
    </div>
  );
}

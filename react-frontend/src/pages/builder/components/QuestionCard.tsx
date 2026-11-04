import React from "react";
import { type DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { useTranslation } from "react-i18next";
import { type Question } from "../../../types/formBuilder";
import {
  choiceMultiIcon,
  choiceSingleIcon,
  npsIcon,
  matrixIcon,
  numberIcon,
  rankingIcon,
  ratingIcon,
  scaleIcon,
  textIcon,
  toggleIcon,
} from "../../../components/ui/icons";
import { ErrorInfo } from "../../../components/ui/ErrorInfo";
import { QUESTION_TYPE_LABEL_KEYS } from "../../../constants";

interface QuestionCardProps {
  question: Question;
  index: number;
  onUpdate: (patch: Partial<Question>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  innerRef?: (element: HTMLElement | null) => void;
  children?: React.ReactNode;
  error?: string;
}

export default function QuestionCard({
  question,
  index,
  onUpdate,
  onDelete,
  onDuplicate,
  dragHandleProps,
  innerRef,
  children,
  error,
}: QuestionCardProps) {
  const { t } = useTranslation();

  return (
    <div
      ref={innerRef}
      className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500"
    >
      <div className="flex items-start gap-3">
        <div
          {...dragHandleProps}
          className="mt-2 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing p-1 rounded-md hover:bg-slate-50 transition-colors select-none text-xl tracking-tighter"
          title={t("builder.questionCard.dragHandle")}
          aria-label={t("builder.questionCard.dragHandle")}
        >
          ⣿
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex gap-2 items-center">
            <span className="text-xs font-bold text-slate-400 font-mono">#{index + 1}</span>
            <input
              type="text"
              value={question.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              placeholder={t("builder.questionCard.textPlaceholder")}
              aria-label={t("builder.questionCard.textAriaLabel")}
              className="w-full text-base font-semibold text-slate-800 placeholder:text-slate-300 bg-transparent border-b border-transparent hover:border-slate-100 focus:border-indigo-500 focus:outline-none pb-1 transition-colors"
            />
          </div>

          <input
            type="text"
            value={question.description || ""}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder={t("builder.questionCard.descriptionPlaceholder")}
            aria-label={t("builder.questionCard.descriptionAriaLabel")}
            className="w-full text-xs text-slate-500 placeholder:text-slate-300 bg-transparent border-b border-transparent hover:border-slate-100 focus:border-indigo-500 focus:outline-none pb-1 transition-colors"
          />

          {error && <ErrorInfo errorText={error} />}
        </div>
      </div>

      <div className="mt-5 pl-8 border-l border-slate-100">
        {children ? (
          children
        ) : (
          <div className="text-xs text-slate-400 italic">
            {t("builder.questionCard.configPlaceholder", { type: question.type })}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
            {question.type === "TEXT" && (
              <>
                {textIcon} {t(QUESTION_TYPE_LABEL_KEYS.TEXT)}
              </>
            )}
            {question.type === "NUMBER" && (
              <>
                {numberIcon} {t(QUESTION_TYPE_LABEL_KEYS.NUMBER)}
              </>
            )}
            {question.type === "CHOICE_SINGLE" && (
              <>
                {choiceSingleIcon} {t(QUESTION_TYPE_LABEL_KEYS.CHOICE_SINGLE)}
              </>
            )}
            {question.type === "CHOICE_MULTI" && (
              <>
                {choiceMultiIcon} {t(QUESTION_TYPE_LABEL_KEYS.CHOICE_MULTI)}
              </>
            )}
            {question.type === "BOOLEAN" && (
              <>
                {toggleIcon} {t("builder.questionCard.toggleBadge")}
              </>
            )}
            {question.type === "DATE" && (
              <>
                {textIcon} {t(QUESTION_TYPE_LABEL_KEYS.DATE)}
              </>
            )}
            {question.type === "RATING" && (
              <>
                {ratingIcon} {t(QUESTION_TYPE_LABEL_KEYS.RATING)}
              </>
            )}
            {question.type === "SCALE" && (
              <>
                {scaleIcon} {t(QUESTION_TYPE_LABEL_KEYS.SCALE)}
              </>
            )}
            {question.type === "NPS" && (
              <>
                {npsIcon} {t(QUESTION_TYPE_LABEL_KEYS.NPS)}
              </>
            )}
            {question.type === "RANKING" && (
              <>
                {rankingIcon} {t(QUESTION_TYPE_LABEL_KEYS.RANKING)}
              </>
            )}
            {question.type === "MATRIX" && (
              <>
                {matrixIcon} {t(QUESTION_TYPE_LABEL_KEYS.MATRIX)}
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 text-slate-400">
          <label className="flex items-center gap-2 cursor-pointer pr-2 border-r border-slate-200 select-none">
            <span className="text-xs font-medium text-slate-500">{t("common.required")}</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) => onUpdate({ required: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-indigo-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600"></div>
            </div>
          </label>

          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-lg p-1.5 hover:bg-slate-50 hover:text-slate-600 transition-colors cursor-pointer"
            aria-label={t("builder.questionCard.duplicate")}
            title={t("builder.questionCard.duplicate")}
          >
            <svg
              aria-hidden="true"
              className="h-4.5 w-4.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 8.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v8.25A2.25 2.25 0 006 16.5h2.25m8.25-8.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-7.5A2.25 2.25 0 018.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 00-2.25 2.25v6"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-1.5 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
            aria-label={t("builder.questionCard.delete")}
            title={t("builder.questionCard.delete")}
          >
            <svg
              aria-hidden="true"
              className="h-4.5 w-4.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

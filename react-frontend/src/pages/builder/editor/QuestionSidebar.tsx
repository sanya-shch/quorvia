import { useEffect, useRef, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { useTranslation } from "react-i18next";
import AppIcon from "../../../components/ui/AppIcon";
import { QUESTION_TYPE_LABEL_KEYS } from "../../../constants";
import type { Question, QuestionType } from "../../../types/formBuilder";
import QuestionTypePicker from "./QuestionTypePicker";
import { AVAILABLE_TYPES } from "./questionTypeMeta";

interface QuestionSidebarProps {
  questions: Question[];
  selectedId: string | null;
  // Question ids whose condition or content has a validation error.
  errorIds: Set<string>;
  onSelect: (id: string) => void;
  onAdd: (type: QuestionType, index: number) => void;
  // A cap on the number of questions (the demo account's limit); adding and duplicating stop there.
  maxQuestions?: number;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  // Asks to move; the page decides (it may refuse and explain: a condition would break).
  onMove: (from: number, to: number) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

// The left column: the form's questions as a compact list. It only reports intent (select, add,
// move, delete); the rules (a condition must look at an earlier question) are applied by the page.
export default function QuestionSidebar({
  questions,
  selectedId,
  errorIds,
  onSelect,
  onAdd,
  maxQuestions = Infinity,
  onDuplicate,
  onDelete,
  onMove,
  collapsed,
  onToggleCollapsed,
}: QuestionSidebarProps) {
  const { t } = useTranslation();
  // Where the next added question goes: null = closed, number = at that index.
  const [pickerAt, setPickerAt] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const atLimit = questions.length >= maxQuestions;
  const listRef = useRef<HTMLDivElement>(null);

  // A newly selected question is scrolled into the list.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-question-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuFor]);

  const onDragEnd = (result: DropResult) => {
    if (result.destination && result.destination.index !== result.source.index) {
      onMove(result.source.index, result.destination.index);
    }
  };

  if (collapsed) {
    return (
      <aside className="hidden w-14 shrink-0 flex-col items-center border-r border-slate-200 bg-white py-3 lg:flex">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={t("builder.editor.sidebar.expand")}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 cursor-pointer"
        >
          <AppIcon name="panelLeft" className="h-5 w-5" />
        </button>
        <span className="mt-3 text-xs font-bold text-slate-500">{questions.length}</span>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-white lg:w-[270px] lg:shrink-0 lg:border-r lg:border-slate-200">
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {t("builder.editor.sidebar.title")}
          </p>
          <p className="text-lg font-bold text-slate-900">
            {t("builder.editor.sidebar.count", { count: questions.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={t("builder.editor.sidebar.collapse")}
          className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:block cursor-pointer"
        >
          <AppIcon name="panelLeft" className="h-5 w-5" />
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {questions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
            {t("builder.editor.sidebar.empty")}
          </p>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="question-list">
              {(droppable) => (
                <ol ref={droppable.innerRef} {...droppable.droppableProps} className="space-y-1.5">
                  {questions.map((question, index) => {
                    const id = question.id ?? `q-${index}`;
                    const selected = id === selectedId;
                    const hasError = errorIds.has(id);
                    return (
                      <Draggable key={id} draggableId={id} index={index}>
                        {(drag, snapshot) => (
                          <li
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            data-question-id={id}
                            className={snapshot.isDragging ? "z-20" : ""}
                          >
                            <div
                              className={`group relative flex items-center gap-2 rounded-xl border px-2 py-2 transition-colors ${
                                selected
                                  ? "border-indigo-300 bg-indigo-50"
                                  : "border-transparent hover:bg-slate-50"
                              } ${snapshot.isDragging ? "shadow-lg" : ""}`}
                            >
                              <span
                                {...drag.dragHandleProps}
                                aria-label={t("builder.questionCard.dragHandle")}
                                className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                              >
                                <AppIcon name="drag" className="h-4 w-4" />
                              </span>
                              <button
                                type="button"
                                onClick={() => onSelect(id)}
                                aria-current={selected ? "true" : undefined}
                                className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
                              >
                                <span
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                                    hasError
                                      ? "bg-rose-100 text-rose-700"
                                      : selected
                                        ? "bg-indigo-600 text-white"
                                        : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-slate-900">
                                    {question.text || t("builder.editor.sidebar.untitled")}
                                  </span>
                                  <span className="block truncate text-xs text-slate-500">
                                    {t(QUESTION_TYPE_LABEL_KEYS[question.type])}
                                  </span>
                                </span>
                                {question.condition && (
                                  <span className="shrink-0 rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                    {t("builder.editor.sidebar.logic")}
                                  </span>
                                )}
                              </button>
                              <button
                                type="button"
                                aria-haspopup="menu"
                                aria-expanded={menuFor === id}
                                aria-label={t("builder.editor.sidebar.menu", { number: index + 1 })}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuFor(menuFor === id ? null : id);
                                }}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 cursor-pointer"
                              >
                                <AppIcon name="dots" className="h-4 w-4" />
                              </button>

                              {menuFor === id && (
                                <div
                                  role="menu"
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-1 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                                >
                                  {[
                                    {
                                      key: "duplicate",
                                      run: () => onDuplicate(index),
                                      disabled: atLimit,
                                      danger: false,
                                    },
                                    {
                                      key: "moveUp",
                                      run: () => onMove(index, index - 1),
                                      disabled: index === 0,
                                      danger: false,
                                    },
                                    {
                                      key: "moveDown",
                                      run: () => onMove(index, index + 1),
                                      disabled: index === questions.length - 1,
                                      danger: false,
                                    },
                                    {
                                      key: "delete",
                                      run: () => onDelete(index),
                                      disabled: false,
                                      danger: true,
                                    },
                                  ].map((item) => (
                                    <button
                                      key={item.key}
                                      role="menuitem"
                                      type="button"
                                      disabled={item.disabled}
                                      onClick={() => {
                                        setMenuFor(null);
                                        item.run();
                                      }}
                                      className={`block w-full px-3 py-2 text-left text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                                        item.danger ? "text-rose-600" : "text-slate-700"
                                      }`}
                                    >
                                      {t(`builder.editor.sidebar.menuItems.${item.key}`)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Quick add between two questions. */}
                            {!atLimit && (
                              <button
                                type="button"
                                onClick={() => setPickerAt(index + 1)}
                                aria-label={t("builder.editor.sidebar.addAfter", {
                                  number: index + 1,
                                })}
                                className="mx-auto my-0.5 flex h-4 w-full items-center justify-center text-slate-300 opacity-0 transition-opacity hover:text-indigo-600 focus:opacity-100 group-hover:opacity-100 [li:hover_&]:opacity-100 cursor-pointer"
                              >
                                <AppIcon name="plus" className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </li>
                        )}
                      </Draggable>
                    );
                  })}
                  {droppable.placeholder}
                </ol>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      <div className="relative border-t border-slate-200 p-4">
        {pickerAt !== null && (
          <QuestionTypePicker
            onClose={() => setPickerAt(null)}
            onPick={(type) => {
              onAdd(type, pickerAt);
              setPickerAt(null);
            }}
          />
        )}
        <button
          type="button"
          onClick={() => setPickerAt(questions.length)}
          disabled={atLimit}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          <AppIcon name="plus" />
          {t("builder.editor.sidebar.add")}
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">
          {atLimit
            ? t("builder.demoLimit")
            : t("builder.editor.sidebar.chooseFrom", { count: AVAILABLE_TYPES.length })}
        </p>
      </div>
    </aside>
  );
}

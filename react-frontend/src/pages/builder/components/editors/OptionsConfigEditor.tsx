import { Droppable, Draggable } from "@hello-pangea/dnd";
import { useTranslation } from "react-i18next";
import { getOtherOption, RANKING_LIMITS } from "@quorvia/shared-types";
import { type QuestionOption, type QuestionDisplayVariant } from "../../../../types/formBuilder";

interface OptionsConfigEditorProps {
  questionIndex: number;
  questionType: "CHOICE_SINGLE" | "CHOICE_MULTI" | "RANKING";
  options: QuestionOption[];
  displayVariant: QuestionDisplayVariant;
  onChangeOptions: (newOptions: QuestionOption[]) => void;
  onChangeDisplayVariant: (variant: QuestionDisplayVariant) => void;
}

export default function OptionsConfigEditor({
  questionIndex,
  questionType,
  options,
  displayVariant,
  onChangeOptions,
  onChangeDisplayVariant,
}: OptionsConfigEditorProps) {
  const { t } = useTranslation();

  // «Інше» завжди останнє (так вимагає й схема форми на сервері), тому звичайні
  // варіанти - це префікс масиву, і їхні індекси збігаються з індексами в options
  // (саме їх використовує drag-and-drop: «Інше» у Droppable не входить).
  const otherOption = getOtherOption(options);
  const regularOptions = options.filter((option) => !option.isOther);
  // Ранжування: лише список варіантів (без "за замовчуванням", «Інше» і стилю
  // відображення), від 2 до 20 штук.
  const isRanking = questionType === "RANKING";
  const minOptions = isRanking ? RANKING_LIMITS.minOptions : 1;
  const canAddOption = !isRanking || regularOptions.length < RANKING_LIMITS.maxOptions;

  const handleAddOption = () => {
    if (!canAddOption) return;

    const newOption: QuestionOption = {
      id: `opt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      text: t("builder.editors.options.newOptionText", { number: regularOptions.length + 1 }),
      isDefault: false,
    };
    onChangeOptions([...regularOptions, newOption, ...(otherOption ? [otherOption] : [])]);
  };

  const handleAddOther = () => {
    if (otherOption) return;

    onChangeOptions([
      ...options,
      {
        id: `opt-other-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        text: t("builder.editors.options.otherDefaultText"),
        isDefault: false,
        isOther: true,
      },
    ]);
  };

  const handleOtherTextChange = (text: string) => {
    onChangeOptions(options.map((option) => (option.isOther ? { ...option, text } : option)));
  };

  const handleRemoveOther = () => {
    onChangeOptions(regularOptions);
  };

  const handleTextChange = (index: number, text: string) => {
    const updated = [...options];
    updated[index] = { ...updated[index], text };
    onChangeOptions(updated);
  };

  const handleRemoveOption = (index: number) => {
    if (regularOptions.length <= minOptions) return;
    onChangeOptions(options.filter((_, i) => i !== index));
  };

  const handleToggleDefault = (index: number) => {
    const updated = options.map((opt, i) => {
      if (questionType === "CHOICE_SINGLE") {
        return { ...opt, isDefault: i === index ? !opt.isDefault : false };
      } else {
        return i === index ? { ...opt, isDefault: !opt.isDefault } : opt;
      }
    });
    onChangeOptions(updated);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-500 block">
          {t("builder.editors.options.label")}
        </label>

        <Droppable droppableId={`options-${questionIndex}`} type="OPTIONS">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {regularOptions.map((option, index) => (
                <Draggable key={option.id} draggableId={option.id} index={index}>
                  {(draggableProvided) => (
                    <div
                      ref={draggableProvided.innerRef}
                      {...draggableProvided.draggableProps}
                      className="flex items-center gap-2 bg-slate-50/50 border border-slate-200/60 rounded-xl p-2 group"
                    >
                      <div
                        {...draggableProvided.dragHandleProps}
                        aria-label={t("builder.editors.options.dragOption")}
                        className="text-slate-500 hover:text-slate-600 cursor-grab px-1"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3.75 9h16.5m-16.5 6.75h16.5"
                          />
                        </svg>
                      </div>

                      {!isRanking ? (
                        <button
                          type="button"
                          onClick={() => handleToggleDefault(index)}
                          className={`h-5 w-5 shrink-0 flex items-center justify-center border transition-all cursor-pointer ${
                            questionType === "CHOICE_SINGLE" ? "rounded-full" : "rounded-md"
                          } ${
                            option.isDefault
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "bg-white border-slate-300 hover:border-slate-400"
                          }`}
                          title={
                            option.isDefault
                              ? t("builder.editors.options.removeDefaultTitle")
                              : t("builder.editors.options.setDefaultTitle")
                          }
                        >
                          {option.isDefault &&
                            (questionType === "CHOICE_SINGLE" ? (
                              <span className="h-2 w-2 bg-white rounded-full" />
                            ) : (
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth="3"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            ))}
                        </button>
                      ) : (
                        <span className="h-5 w-5 shrink-0 text-center text-xs font-bold text-slate-500">
                          {index + 1}
                        </span>
                      )}

                      <input
                        type="text"
                        value={option.text}
                        onChange={(e) => handleTextChange(index, e.target.value)}
                        className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-700 focus:outline-none placeholder-slate-400"
                        placeholder={t("builder.editors.options.textPlaceholder")}
                      />

                      <button
                        type="button"
                        onClick={() => handleRemoveOption(index)}
                        disabled={regularOptions.length <= minOptions}
                        aria-label={t("builder.editors.options.removeOption")}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer disabled:opacity-0"
                      >
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        {otherOption && (
          <div className="flex items-center gap-2 bg-slate-50/50 border border-dashed border-slate-300 rounded-xl p-2 group">
            <span
              aria-hidden="true"
              className="ml-6 h-5 w-5 shrink-0 border border-dashed border-slate-300 bg-white rounded-full"
            />
            <input
              type="text"
              value={otherOption.text}
              onChange={(e) => handleOtherTextChange(e.target.value)}
              aria-label={t("builder.editors.options.otherLabel")}
              className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-700 focus:outline-none placeholder-slate-400"
              placeholder={t("builder.editors.options.otherDefaultText")}
            />
            <span className="shrink-0 text-xs text-slate-500">
              {t("builder.editors.options.otherHint")}
            </span>
            <button
              type="button"
              onClick={handleRemoveOther}
              aria-label={t("builder.editors.options.removeOther")}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-1">
          <button
            type="button"
            onClick={handleAddOption}
            disabled={!canAddOption}
            className="disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-500 bg-indigo-50/50 hover:bg-indigo-50 px-3 py-2 rounded-xl border border-dashed border-indigo-200 transition-all cursor-pointer"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5H4.5" />
            </svg>
            {t("builder.editors.options.addOption")}
          </button>

          {!otherOption && !isRanking && (
            <button
              type="button"
              onClick={handleAddOther}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-xl border border-dashed border-slate-300 transition-all cursor-pointer"
            >
              {t("builder.editors.options.addOther")}
            </button>
          )}
        </div>
      </div>

      {!isRanking && (
        <>
          <hr className="border-slate-100" />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500">
              {t("builder.editors.options.displayStyleLabel")}
            </label>

            <div className="flex flex-wrap gap-2 bg-slate-100 p-1 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => onChangeDisplayVariant("list")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  displayVariant === "list"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {t("builder.editors.options.displayList")}
              </button>

              <button
                type="button"
                onClick={() => onChangeDisplayVariant("tabs")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  displayVariant === "tabs"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {t("builder.editors.options.displayTabs")}
              </button>

              <button
                type="button"
                disabled={questionType === "CHOICE_MULTI"}
                onClick={() => onChangeDisplayVariant("dropdown")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  displayVariant === "dropdown"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
                title={
                  questionType === "CHOICE_MULTI"
                    ? t("builder.editors.options.dropdownDisabledHint")
                    : ""
                }
              >
                {t("builder.editors.options.displayDropdown")}
              </button>
            </div>
          </div>
        </>
      )}

      {isRanking && (
        <p className="text-xs text-slate-500">{t("builder.editors.options.rankingHint")}</p>
      )}
    </div>
  );
}

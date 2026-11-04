import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type FormState, type Question, type QuestionType } from "../../../types/formBuilder";
import { validateConditionGraph } from "@quorvia/condition-engine";
import { ErrorCode } from "@quorvia/shared-types";
import { createDefaultOptions, createDefaultQuestionConfig } from "../questionConfig";

const INITIAL_STATE: FormState = {
  title: "",
  description: "",
  responseMode: "ALL_AT_ONCE",
  questions: [],
};

export function useFormBuilder(initialData?: FormState) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(initialData || INITIAL_STATE);
  // "Брудність" - це лічильник правок, а не булевий прапорець: збереження
  // фіксує, скільки правок було на момент відправки (markSaved), тож правки,
  // зроблені поки запит летів, лишаються незбереженими. З прапорцем
  // успішна відповідь скидала б його й для них.
  const editsRef = useRef(0);
  const [edits, setEdits] = useState(0);
  const [savedEdits, setSavedEdits] = useState(0);
  const isDirty = edits !== savedEdits;

  const markDirty = useCallback(() => {
    editsRef.current += 1;
    setEdits(editsRef.current);
  }, []);

  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * Значення в `errors` - НЕ готовий текст, а повний ключ перекладу i18next
   * ("errors.VALIDATION_FIELD_REQUIRED" або "conditionErrors.CYCLE") - той
   * самий формат для обох джерел, щоб FormBuilder.tsx міг просто робити
   * t(errors[key]) без розбору, звідки саме прийшла помилка.
   */
  const validate = useCallback((formData: FormState): Record<string, string> => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim())
      newErrors["title"] = `errors.${ErrorCode.VALIDATION_FIELD_REQUIRED}`;

    formData.questions.forEach((q, index) => {
      if (!q.text.trim()) newErrors[`q-${index}`] = `errors.${ErrorCode.VALIDATION_FIELD_REQUIRED}`;
    });

    const questionsWithId = formData.questions.filter((q): q is Question & { id: string } =>
      Boolean(q.id),
    );
    const graph = validateConditionGraph(
      questionsWithId.map((q) => ({ id: q.id, order: q.order, condition: q.condition })),
    );

    if (!graph.valid) {
      const indexByQuestionId = new Map(formData.questions.map((q, i) => [q.id, i]));
      for (const err of graph.errors) {
        const index = indexByQuestionId.get(err.questionId);
        if (index !== undefined) {
          newErrors[`q-${index}-condition`] = `conditionErrors.${err.reason}`;
        }
      }
    }

    return newErrors;
  }, []);

  const trySave = useCallback(
    (onSuccess: () => void) => {
      setHasAttemptedSave(true);
      const newErrors = validate(form);
      setErrors(newErrors);

      if (Object.keys(newErrors).length === 0) {
        onSuccess();
      }
    },
    [form, validate],
  );

  /** Позначає форму чистою відносно ПОТОЧНОГО стану (завантаження з сервера). */
  const resetDirty = useCallback(() => setSavedEdits(editsRef.current), []);

  /** Позначає чистою відносно стану на момент відправки (revision - значення `edits` тоді). */
  const markSaved = useCallback((revision: number) => setSavedEdits(revision), []);

  const updateFormMeta = useCallback(
    (fields: Partial<Omit<FormState, "questions">>) => {
      setForm((prev) => {
        const nextState = { ...prev, ...fields };
        if (hasAttemptedSave) setErrors(validate(nextState));

        return nextState;
      });

      markDirty();
    },
    [hasAttemptedSave, validate, markDirty],
  );

  // const addQuestion = useCallback((type: QuestionType) => {
  //   const isChoice = ["CHOICE_SINGLE", "CHOICE_MULTI"].includes(type);

  //   setForm((prev) => {
  //     const newQuestion: Question = {
  //       type,
  //       text: "",
  //       required: false,
  //       order: prev.questions.length,
  //       options: isChoice ? [{ id: `opt-${Date.now()}`, text: "Варіант 1", isDefault: false }] : [],
  //       config: isChoice
  //         ? { displayVariant: "list" }
  //         : type === "TEXT"
  //           ? { variant: "input" }
  //           : type === "BOOLEAN"
  //             ? { defaultValue: false }
  //             : null,
  //     };
  //     return {
  //       ...prev,
  //       questions: [...prev.questions, newQuestion],
  //     };
  //   });
  //   markDirty();
  // }, []);

  const updateQuestion = useCallback(
    (index: number, patch: Partial<Question>) => {
      setForm((prev) => {
        const updatedQuestions = [...prev.questions];
        updatedQuestions[index] = { ...updatedQuestions[index], ...patch };
        const nextState = { ...prev, questions: updatedQuestions };

        if (hasAttemptedSave) setErrors(validate(nextState));

        return nextState;
      });

      markDirty();
    },
    [hasAttemptedSave, validate, markDirty],
  );

  const deleteQuestion = useCallback(
    (index: number) => {
      setForm((prev) => {
        const filtered = prev.questions.filter((_, i) => i !== index);
        const reordered = filtered.map((q, i) => ({ ...q, order: i }));

        const nextState = { ...prev, questions: reordered };
        if (hasAttemptedSave) setErrors(validate(nextState));

        return nextState;
      });

      markDirty();
    },
    [hasAttemptedSave, validate, markDirty],
  );

  const duplicateQuestion = useCallback(
    (index: number) => {
      setForm((prev) => {
        const source = prev.questions[index];
        const duplicated: Question = {
          ...source,
          id: crypto.randomUUID(),
          options: [...source.options],
          config: source.config ? { ...source.config } : null,
          condition: null,
        };

        const updated = [...prev.questions];
        updated.splice(index + 1, 0, duplicated);

        const reordered = updated.map((q, i) => ({ ...q, order: i }));

        const nextState = { ...prev, questions: reordered };
        if (hasAttemptedSave) setErrors(validate(nextState));

        return nextState;
      });
      markDirty();
    },
    [hasAttemptedSave, validate, markDirty],
  );

  const moveQuestion = useCallback(
    (fromIndex: number, toIndex: number) => {
      setForm((prev) => {
        const updated = [...prev.questions];
        const [removed] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, removed);

        const reordered = updated.map((q, i) => ({ ...q, order: i }));

        const nextState = { ...prev, questions: reordered };
        if (hasAttemptedSave) setErrors(validate(nextState));

        return nextState;
      });
      markDirty();
    },
    [hasAttemptedSave, validate, markDirty],
  );

  const moveOption = useCallback((questionIndex: number, fromIndex: number, toIndex: number) => {
    setForm((prev) => {
      const questions = [...prev.questions];
      const targetQuestion = { ...questions[questionIndex] };
      const updatedOptions = [...targetQuestion.options];

      const [removed] = updatedOptions.splice(fromIndex, 1);
      updatedOptions.splice(toIndex, 0, removed);

      targetQuestion.options = updatedOptions;
      questions[questionIndex] = targetQuestion;

      return { ...prev, questions };
    });
    markDirty();
  }, [markDirty]);

  const addQuestionAtPosition = useCallback(
    (type: QuestionType, index: number) => {
      setForm((prev) => {
        const newQuestion: Question = {
          id: crypto.randomUUID(),
          type,
          text: "",
          description: "",
          required: false,
          order: index,
          options: createDefaultOptions(type, (number) =>
            type === "MATRIX"
              ? t("builder.editors.matrix.newColumnText", { number })
              : t("builder.editors.options.newOptionText", { number }),
          ),
          config: createDefaultQuestionConfig(type, (number) =>
            t("builder.editors.matrix.newRowText", { number }),
          ),
        };

        const updatedQuestions = [...prev.questions];
        updatedQuestions.splice(index, 0, newQuestion);

        const reordered = updatedQuestions.map((q, i) => ({ ...q, order: i }));

        const nextState = {
          ...prev,
          questions: reordered,
        };
        if (hasAttemptedSave) setErrors(validate(nextState));

        return nextState;
      });
      markDirty();
    },
    [hasAttemptedSave, validate, t, markDirty],
  );

  return {
    form,
    setForm,
    errors,
    trySave,
    isDirty,
    /** Номер поточної правки: передається в markSaved після успішного збереження. */
    revision: edits,
    resetDirty,
    markSaved,
    updateFormMeta,
    // addQuestion,
    updateQuestion,
    deleteQuestion,
    duplicateQuestion,
    moveQuestion,
    moveOption,
    addQuestionAtPosition,
  };
}

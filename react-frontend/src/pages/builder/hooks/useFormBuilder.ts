import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { type FormState, type Question, type QuestionType } from "../../../types/formBuilder";
import { validateConditionGraph } from "@quorvia/condition-engine";
import { ErrorCode } from "@quorvia/shared-types";

const INITIAL_STATE: FormState = {
  title: "",
  description: "",
  responseMode: "ALL_AT_ONCE",
  questions: [],
};

export function useFormBuilder(initialData?: FormState) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(initialData || INITIAL_STATE);
  const [isDirty, setIsDirty] = useState(false);

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

  const resetDirty = useCallback(() => setIsDirty(false), []);

  const updateFormMeta = useCallback(
    (fields: Partial<Omit<FormState, "questions">>) => {
      setForm((prev) => {
        const nextState = { ...prev, ...fields };
        if (hasAttemptedSave) setErrors(validate(nextState));

        return nextState;
      });

      setIsDirty(true);
    },
    [hasAttemptedSave, validate],
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
  //   setIsDirty(true);
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

      setIsDirty(true);
    },
    [hasAttemptedSave, validate],
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

      setIsDirty(true);
    },
    [hasAttemptedSave, validate],
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
      setIsDirty(true);
    },
    [hasAttemptedSave, validate],
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
      setIsDirty(true);
    },
    [hasAttemptedSave, validate],
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
    setIsDirty(true);
  }, []);

  const addQuestionAtPosition = useCallback(
    (type: QuestionType, index: number) => {
      const isChoice = ["CHOICE_SINGLE", "CHOICE_MULTI"].includes(type);

      setForm((prev) => {
        const newQuestion: Question = {
          id: crypto.randomUUID(),
          type,
          text: "",
          description: "",
          required: false,
          order: index,
          options: isChoice
            ? [
                {
                  id: `opt-${Date.now()}`,
                  text: t("builder.editors.options.newOptionText", { number: 1 }),
                  isDefault: false,
                },
              ]
            : [],
          config: isChoice
            ? { displayVariant: "list" }
            : type === "TEXT"
              ? { variant: "input" }
              : type === "BOOLEAN"
                ? { defaultValue: false }
                : null,
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
      setIsDirty(true);
    },
    [hasAttemptedSave, validate, t],
  );

  return {
    form,
    setForm,
    errors,
    trySave,
    isDirty,
    resetDirty,
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

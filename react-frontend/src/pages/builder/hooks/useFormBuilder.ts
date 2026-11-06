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
  // "Dirtiness" is an edit counter, not a boolean: saving records how many edits there were
  // when the request was sent (markSaved), so edits made while the request was in flight stay
  // unsaved. With a flag, a successful response would reset it for them too.
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

  // Values in `errors` are NOT display text but a full i18next translation key
  // ("errors.VALIDATION_FIELD_REQUIRED" or "conditionErrors.CYCLE"), the same format for both
  // sources, so FormBuilder.tsx can simply do t(errors[key]) without caring where the error came from.
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

  // Marks the form clean relative to the CURRENT state (loading from the server).
  const resetDirty = useCallback(() => setSavedEdits(editsRef.current), []);

  // Marks it clean relative to the state when the request was sent (revision is the value of `edits` then).
  const markSaved = useCallback((revision: number) => setSavedEdits(revision), []);

  // Arbitrary change of the whole form state with a pure function (languages and translations
  // touch the form and every question at once; separate updateFormMeta/updateQuestion calls
  // would count N edits instead of one).
  const updateForm = useCallback(
    (updater: (prev: FormState) => FormState) => {
      setForm((prev) => {
        const nextState = updater(prev);
        if (nextState === prev) return prev;
        if (hasAttemptedSave) setErrors(validate(nextState));

        return nextState;
      });

      markDirty();
    },
    [hasAttemptedSave, validate, markDirty],
  );

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

  const moveOption = useCallback(
    (questionIndex: number, fromIndex: number, toIndex: number) => {
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
    },
    [markDirty],
  );

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
    // Number of the current edit: passed to markSaved after a successful save.
    revision: edits,
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
  };
}

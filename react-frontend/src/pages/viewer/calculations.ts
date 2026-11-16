import { useMemo } from "react";
import {
  compileCalculations,
  computeCalculations,
  type CalcValue,
  type FormulaQuestion,
} from "@quorvia/calculation-engine";
import type { Question } from "../../types/formBuilder";
import type { FormAnswers } from "../../types/formViewer";

// Calculation fields in the viewer. The respondent sees the value change while they answer; it is
// computed by the same engine the server runs. The server's value is the one that counts: it
// recomputes everything on submit and overwrites whatever the client might send (the client does
// not send these values at all).

// A calculation the respondent is not meant to see. The server leaves such a field out of the form
// it sends; this only keeps an odd payload from showing it.
export const isHiddenCalculation = (question: Question): boolean =>
  question.type === "CALCULATION" && question.config?.display === "hidden";

const toFormulaQuestions = (questions: readonly Question[]): FormulaQuestion[] =>
  questions.flatMap((q) =>
    q.id ? [{ id: q.id, type: q.type, options: q.options, config: q.config }] : [],
  );

// questionId -> the computed value, null when there is none (shown as a dash).
export type CalculatedValues = Readonly<Record<string, CalcValue | null>>;

const NONE: CalculatedValues = Object.freeze({});

export const calculateValues = (
  questions: readonly Question[],
  answers: Readonly<Record<string, unknown>>,
  visibleQuestionIds: ReadonlySet<string> | null,
): CalculatedValues => {
  const formulaQuestions = toFormulaQuestions(questions);

  if (!formulaQuestions.some((q) => q.type === "CALCULATION")) return NONE;

  return computeCalculations(
    formulaQuestions,
    answers,
    visibleQuestionIds,
    compileCalculations(formulaQuestions),
  ).values;
};

// The values for the current answers. The formulas are parsed again only when the questions change.
export const useCalculatedValues = (
  questions: readonly Question[],
  answers: FormAnswers,
  visibleQuestionIds: ReadonlySet<string> | null,
): CalculatedValues => {
  const compiled = useMemo(() => {
    const formulaQuestions = toFormulaQuestions(questions);

    return formulaQuestions.some((q) => q.type === "CALCULATION")
      ? { formulaQuestions, compiled: compileCalculations(formulaQuestions) }
      : null;
  }, [questions]);

  return useMemo(
    () =>
      compiled
        ? computeCalculations(
            compiled.formulaQuestions,
            answers,
            visibleQuestionIds,
            compiled.compiled,
          ).values
        : NONE,
    [compiled, answers, visibleQuestionIds],
  );
};

// The answers with the computed values in them, for the places that show an answer by question id.
// A value that could not be computed is left out.
export const withCalculatedValues = (
  answers: FormAnswers,
  values: CalculatedValues,
): FormAnswers => {
  const merged: FormAnswers = { ...answers };

  for (const [id, value] of Object.entries(values)) {
    if (value !== null) merged[id] = value;
    else delete merged[id];
  }

  return merged;
};

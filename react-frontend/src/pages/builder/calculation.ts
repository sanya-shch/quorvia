import {
  computeCalculations,
  formatCalcValue,
  refTypeOf,
  validateCalculations,
  analyzeFormula,
  collectRefs,
  parseFormula,
  type CalcValue,
  type EvalErrorCode,
  type FormulaDiagnostic,
  type FormulaQuestion,
} from "@quorvia/calculation-engine";
import { CALCULATION_LIMITS, type QuestionConfig } from "@quorvia/shared-types";
import type { Question } from "../../types/formBuilder";

// Everything about calculation fields in the builder: pure functions, no React. The formula engine
// is the one the server runs, so the builder shows exactly what the server will accept.

export const CALCULATION_ERROR_KEY_PREFIX = "builder.editors.calculation.errors.";

// Saved questions only (they have an id), as the engine wants them.
export const toFormulaQuestions = (questions: readonly Question[]): FormulaQuestion[] =>
  questions.flatMap((q) =>
    q.id ? [{ id: q.id, type: q.type, options: q.options, config: q.config }] : [],
  );

// The questions a formula may read: everything with a value the engine understands, except the field
// itself. (Another calculation is allowed; a circle is reported by the dependency check.)
export const referenceableQuestions = (
  questions: readonly Question[],
  selfId: string | undefined,
): (Question & { id: string })[] =>
  questions.filter(
    (q): q is Question & { id: string } =>
      Boolean(q.id) && q.id !== selfId && refTypeOf(toFormulaQuestion(q)) !== null,
  );

const toFormulaQuestion = (q: Question): FormulaQuestion => ({
  id: q.id ?? "",
  type: q.type,
  options: q.options,
  config: q.config,
});

export interface CalculationProblem extends FormulaDiagnostic {
  // The translation key of the message.
  messageKey: string;
}

const problemOf = (diagnostic: FormulaDiagnostic): CalculationProblem => ({
  ...diagnostic,
  messageKey: `${CALCULATION_ERROR_KEY_PREFIX}${diagnostic.code}`,
});

// The problem of one calculation field (the first), or null when its formula is fine. A field
// without an id cannot be referenced and cannot be saved by the server either, but it never
// reaches here: the builder gives every question an id when it is created.
export const checkCalculation = (
  question: Question,
  questions: readonly Question[],
): CalculationProblem | null => {
  const config = question.config;
  const byId = new Map(toFormulaQuestions(questions).map((q) => [q.id, q]));
  const own = analyzeFormula(
    {
      formula: config?.formula ?? "",
      resultType: config?.resultType ?? "number",
      decimals: config?.decimals,
    },
    byId,
  );

  if (!own.ok) return problemOf(own.error);

  // Circles and a visible field that reads a hidden one are found over the whole form.
  const shared = validateCalculations(toFormulaQuestions(questions)).find(
    (issue) => issue.questionId === question.id || issue.cycle?.includes(question.id ?? ""),
  );

  return shared ? problemOf(shared) : null;
};

// Index of the question -> the translation key of its problem, for every calculation field that
// cannot be saved. The server refuses them, so saving is blocked until they are fixed.
export const findCalculationProblems = (questions: readonly Question[]): Map<number, string> => {
  const problems = new Map<number, string>();

  questions.forEach((q, index) => {
    if (q.type !== "CALCULATION") return;

    const problem = checkCalculation(q, questions);

    if (problem) problems.set(index, problem.messageKey);
  });

  return problems;
};

export const canAddCalculation = (questions: readonly Question[]): boolean =>
  questions.filter((q) => q.type === "CALCULATION").length < CALCULATION_LIMITS.perForm;

// The inputs a calculation needs for the test panel: the questions it reads, following other
// calculation fields down to the questions they read, in the order of the form.
export const testInputQuestions = (
  calculation: Question,
  questions: readonly Question[],
): (Question & { id: string })[] => {
  const byId = new Map(questions.flatMap((q) => (q.id ? [[q.id, q] as const] : [])));
  const needed = new Set<string>();
  const seen = new Set<string>();

  const visit = (q: Question): void => {
    const formula = q.config?.formula;

    if (!q.id || seen.has(q.id) || !formula) return;

    seen.add(q.id);

    const parsed = parseFormula(formula);

    if (!parsed.ok) return;

    for (const id of collectRefs(parsed.ast)) {
      const target = byId.get(id);

      if (!target) continue;

      if (target.type === "CALCULATION") visit(target);
      else needed.add(id);
    }
  };

  visit(calculation);

  return questions.filter(
    (q): q is Question & { id: string } => Boolean(q.id) && needed.has(q.id!),
  );
};

export type TestAnswers = Record<string, unknown>;

export interface TestResult {
  // The value as the respondent would read it; null when it has none.
  text: string | null;
  value: CalcValue | null;
  error: EvalErrorCode | null;
}

// What the server would compute for these sample answers (nothing is hidden in the test).
export const runCalculationTest = (
  calculation: Question,
  questions: readonly Question[],
  answers: TestAnswers,
): TestResult => {
  const id = calculation.id;
  const config = calculation.config;

  if (!id || !config?.resultType) return { text: null, value: null, error: "INVALID_FORMULA" };

  const computed = computeCalculations(toFormulaQuestions(questions), answers, null);
  const value = computed.values[id] ?? null;

  return {
    value,
    error: computed.errors[id] ?? null,
    text:
      value === null
        ? null
        : formatCalcValue(value, { ...config, resultType: config.resultType }, null),
  };
};

// A new calculation's config. The formula is empty: the field cannot be saved until it has one.
export const defaultCalculationConfig = (): QuestionConfig => ({
  formula: "",
  resultType: "number",
  decimals: CALCULATION_LIMITS.decimals.default,
  display: "visible",
  emptyAsZero: true,
});

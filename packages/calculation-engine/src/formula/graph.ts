import { analyzeFormula } from "./check.js";
import { collectRefs } from "./parser.js";
import { evaluateFormula, type EvalEnv } from "./evaluate.js";
import {
  type CalcValue,
  type CalculationConfig,
  type EvalErrorCode,
  type FormulaDiagnostic,
  type FormulaNode,
  type FormulaQuestion,
} from "./types.js";

const calcConfig = (question: FormulaQuestion): CalculationConfig | null => {
  const c = question.config;

  return question.type === "CALCULATION" && c && typeof c.formula === "string" && c.resultType
    ? { ...c, formula: c.formula, resultType: c.resultType }
    : null;
};

export interface FormulaIssue extends FormulaDiagnostic {
  questionId: string;
  // FORMULA_CYCLE: the calculation fields on the cycle, e.g. [a, b, a].
  cycle?: string[];
}

interface Compiled {
  question: FormulaQuestion;
  config: CalculationConfig;
  ast: FormulaNode;
  // Calculation fields this one reads.
  deps: string[];
}

const compileOne = (question: FormulaQuestion, byId: ReadonlyMap<string, FormulaQuestion>) => {
  const config = calcConfig(question);

  if (!config) {
    return {
      error: {
        code: "INVALID_CONFIG",
        message: "The calculation has no formula or result type.",
        pos: 0,
        end: 0,
      } as FormulaDiagnostic,
    };
  }

  const analyzed = analyzeFormula(config, byId);

  if (!analyzed.ok) return { error: analyzed.error };

  const deps = [...collectRefs(analyzed.ast)].filter((id) => byId.get(id)?.type === "CALCULATION");

  return { compiled: { question, config, ast: analyzed.ast, deps } satisfies Compiled };
};

// Finds one cycle among calculation fields (depth-first), or null.
const findCycle = (nodes: ReadonlyMap<string, readonly string[]>): string[] | null => {
  const state = new Map<string, 1 | 2>(); // 1 = on the current path, 2 = done
  const path: string[] = [];

  const visit = (id: string): string[] | null => {
    state.set(id, 1);
    path.push(id);

    for (const dep of nodes.get(id) ?? []) {
      if (state.get(dep) === 1) return [...path.slice(path.indexOf(dep)), dep];

      if (!state.has(dep)) {
        const found = visit(dep);

        if (found) return found;
      }
    }

    path.pop();
    state.set(id, 2);

    return null;
  };

  for (const id of nodes.keys()) {
    if (!state.has(id)) {
      const found = visit(id);

      if (found) return found;
    }
  }

  return null;
};

// Where a question is first referred to in a formula.
const refSpan = (node: FormulaNode, id: string): { pos: number; end: number } => {
  let found: { pos: number; end: number } | null = null;

  const walk = (n: FormulaNode): void => {
    if (found) return;

    switch (n.kind) {
      case "ref":
        if (n.id === id) found = { pos: n.pos, end: n.end };
        break;
      case "unary":
        walk(n.arg);
        break;
      case "binary":
        walk(n.left);
        walk(n.right);
        break;
      case "call":
        n.args.forEach(walk);
        break;
      default:
    }
  };

  walk(node);

  return found ?? { pos: 0, end: 0 };
};

export interface CompiledCalculations {
  // Calculation fields in an order where every field comes after the ones it reads.
  order: readonly string[];
  fields: ReadonlyMap<string, Compiled>;
  issues: readonly FormulaIssue[];
}

/**
 * Parses and checks every calculation field of a form and orders them by dependency. A field with
 * a problem is left out of `order` and listed in `issues`; the engine never throws on stored data.
 */
export const compileCalculations = (
  questions: readonly FormulaQuestion[],
): CompiledCalculations => {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const fields = new Map<string, Compiled>();
  const issues: FormulaIssue[] = [];

  for (const question of questions) {
    if (question.type !== "CALCULATION") continue;

    const result = compileOne(question, byId);

    if ("error" in result && result.error)
      issues.push({ ...result.error, questionId: question.id });
    else if (result.compiled) fields.set(question.id, result.compiled);
  }

  // A calculation the respondent sees must not read one they do not see: the hidden formula stays
  // on the server, so the viewer could not show the value.
  for (const [id, field] of fields) {
    if (field.config.display === "hidden") continue;

    for (const dep of field.deps) {
      if (fields.get(dep)?.config.display !== "hidden") continue;

      issues.push({
        code: "HIDDEN_REFERENCE",
        message:
          "A visible calculation cannot use a calculation that is hidden from the respondent.",
        ...refSpan(field.ast, dep),
        questionId: id,
      });
    }
  }

  // Cycles: report each one once and drop its fields (they cannot be ordered or computed).
  const edges = new Map([...fields].map(([id, f]) => [id, f.deps.filter((d) => fields.has(d))]));

  for (let cycle = findCycle(edges); cycle; cycle = findCycle(edges)) {
    const first = cycle[0]!;

    issues.push({
      code: "FORMULA_CYCLE",
      message: "Calculation fields refer to each other in a circle.",
      pos: 0,
      end: 0,
      questionId: first,
      cycle,
    });

    for (const id of new Set(cycle)) {
      edges.delete(id);
      fields.delete(id);
    }

    for (const [id, deps] of edges)
      edges.set(
        id,
        deps.filter((d) => edges.has(d)),
      );
  }

  // Topological order (Kahn), ties broken by the form's own question order.
  const position = new Map(questions.map((q, i) => [q.id, i]));
  const pending = new Map(
    [...fields].map(([id, f]) => [id, new Set(f.deps.filter((d) => fields.has(d)))]),
  );
  const order: string[] = [];

  while (pending.size > 0) {
    const ready = [...pending].filter(([, deps]) => deps.size === 0).map(([id]) => id);

    // Cycles were removed above, so something is always ready.
    if (ready.length === 0) break;

    ready.sort((a, b) => position.get(a)! - position.get(b)!);

    const id = ready[0]!;

    order.push(id);
    pending.delete(id);

    for (const deps of pending.values()) deps.delete(id);
  }

  return { order, fields, issues };
};

/** Problems of all calculation fields, for the server on save and the builder. */
export const validateCalculations = (questions: readonly FormulaQuestion[]): FormulaIssue[] => [
  ...compileCalculations(questions).issues,
];

export interface CalculationResults {
  // Computed fields: questionId -> stored value (null when it could not be computed).
  values: Record<string, CalcValue | null>;
  // Why a value is null.
  errors: Record<string, EvalErrorCode>;
}

/**
 * Computes every calculation field in dependency order. `visibleQuestionIds` (null = all) are the
 * questions the respondent was shown: hidden inputs count as empty, and a hidden calculation field
 * is not computed. A field that reads a failed (null) field sees it as empty: 0 / "" / false, or
 * EMPTY_REFERENCE when its own emptyAsZero is off.
 */
export const computeCalculations = (
  questions: readonly FormulaQuestion[],
  answers: Readonly<Record<string, unknown>>,
  visibleQuestionIds: ReadonlySet<string> | null = null,
  compiled: CompiledCalculations = compileCalculations(questions),
): CalculationResults => {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const calcValues = new Map<string, CalcValue | null>();
  const results: CalculationResults = {
    values: Object.create(null) as Record<string, CalcValue | null>,
    errors: Object.create(null) as Record<string, EvalErrorCode>,
  };

  for (const issue of compiled.issues) {
    // Every field on a cycle is affected, not only the one the issue is reported on.
    for (const id of issue.cycle ?? [issue.questionId]) {
      results.values[id] = null;
      results.errors[id] = "INVALID_FORMULA";
    }
  }

  for (const id of compiled.order) {
    const field = compiled.fields.get(id)!;

    if (visibleQuestionIds && !visibleQuestionIds.has(id)) continue;

    const env: EvalEnv = {
      questions: byId,
      answers,
      visibleIds: visibleQuestionIds,
      calcValues,
      emptyAsZero: field.config.emptyAsZero !== false,
    };
    const result = evaluateFormula(field.ast, env, field.config);

    calcValues.set(id, result.ok ? result.value : null);
    results.values[id] = result.ok ? result.value : null;

    if (!result.ok) results.errors[id] = result.code;
  }

  return results;
};

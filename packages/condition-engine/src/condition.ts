/**
 * Умовна логіка питань (conditional logic).
 *
 * Питання може мати `condition` — правило, яке визначає, чи показувати його,
 * залежно від відповідей на попередні питання. Модуль навмисно не залежить
 * від Express/Prisma/React/Vue: це чисті функції, які однаково
 * використовуються і на бекенді (валідація при збереженні форми, серверний
 * перерахунок видимості відповіді), і на будь-якому фронтенді (question-by-question
 * режим проходження).
 */

import type {
  ConditionGroup,
  ConditionOperator,
  ConditionRule,
  ConditionValue,
} from "@quorvia/shared-types";

export type { ConditionGroup, ConditionOperator, ConditionRule, ConditionValue };

/** Відповіді, зібрані до поточного моменту проходження форми: questionId -> значення. */
export type AnswersMap = Record<string, unknown>;

/** Мінімум інформації про питання, потрібний для роботи з умовами. */
export interface QuestionLike {
  id: string;
  condition?: ConditionGroup | null;
}

const toComparable = (value: unknown): string | number | boolean | undefined => {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return undefined;
};

const evaluateRule = (rule: ConditionRule, answers: AnswersMap): boolean => {
  const actual = answers[rule.questionId];

  switch (rule.operator) {
    case "equals":
      return toComparable(actual) === rule.value;

    case "notEquals":
      return toComparable(actual) !== rule.value;

    case "gt": {
      const a = toComparable(actual);
      return typeof a === "number" && typeof rule.value === "number" && a > rule.value;
    }

    case "lt": {
      const a = toComparable(actual);
      return typeof a === "number" && typeof rule.value === "number" && a < rule.value;
    }

    case "contains": {
      // actual - масив (CHOICE_MULTI) або рядок; rule.value - те, що шукаємо всередині
      if (Array.isArray(actual)) {
        return actual.includes(rule.value as string);
      }
      if (typeof actual === "string" && typeof rule.value === "string") {
        return actual.includes(rule.value);
      }
      return false;
    }

    case "in": {
      // rule.value - масив можливих значень, actual - одне значення
      const a = toComparable(actual);
      return Array.isArray(rule.value) && a !== undefined && rule.value.includes(a as string);
    }

    default:
      return false;
  }
};

/**
 * Обчислює, чи має питання бути показане, враховуючи вже дані відповіді.
 * Питання без `condition` завжди видиме.
 */
export const evaluateCondition = (
  condition: ConditionGroup | null | undefined,
  answers: AnswersMap,
): boolean => {
  if (!condition || condition.rules.length === 0) return true;

  return condition.logic === "AND"
    ? condition.rules.every((rule) => evaluateRule(rule, answers))
    : condition.rules.some((rule) => evaluateRule(rule, answers));
};

/**
 * Для повного набору питань і повного набору відповідей визначає, які
 * питання були фактично видимі (eligible to show). Використовується і
 * бекендом (перерахунок при збереженні Response, щоб не покладатись на
 * клієнта), і аналітикою (щоб відрізнити "приховане умовою" від
 * "показане, але пропущене користувачем").
 */
export const resolveVisibleQuestionIds = (
  questions: QuestionLike[],
  answers: AnswersMap,
): Set<string> => {
  const visible = new Set<string>();
  for (const q of questions) {
    if (evaluateCondition(q.condition, answers)) {
      visible.add(q.id);
    }
  }
  return visible;
};

export interface ConditionGraphError {
  questionId: string;
  reason: "SELF_REFERENCE" | "UNKNOWN_QUESTION" | "CYCLE" | "FORWARD_REFERENCE";
  detail: string;
}

export interface ConditionGraphValidationResult {
  valid: boolean;
  errors: ConditionGraphError[];
}

/**
 * Валідує граф залежностей condition.rules[].questionId для повного набору
 * питань форми:
 *  - посилання на неіснуюче questionId,
 *  - самопосилання (Q1 залежить від Q1),
 *  - цикли (Q1 -> Q2 -> Q1) через DFS з відстеженням поточного шляху,
 *  - forward-reference: питання не може залежати від питання, яке йде після
 *    нього за `order` (в question-by-question режимі це недосяжний стан:
 *    відповіді на майбутнє питання ще нема).
 *
 * Викликається на бекенді при create/update форми — це джерело правди,
 * клієнтська валідація в білдері лише дублює для миттєвого фідбеку.
 */
export const validateConditionGraph = (
  questions: (QuestionLike & { order: number })[],
): ConditionGraphValidationResult => {
  const errors: ConditionGraphError[] = [];
  const byId = new Map(questions.map((q) => [q.id, q]));

  // forward-reference / unknown / self-reference - перевіряються незалежно від циклів
  for (const q of questions) {
    if (!q.condition) continue;

    for (const rule of q.condition.rules) {
      if (rule.questionId === q.id) {
        errors.push({
          questionId: q.id,
          reason: "SELF_REFERENCE",
          detail: `Питання ${q.id} не може залежати саме від себе`,
        });
        continue;
      }

      const target = byId.get(rule.questionId);
      if (!target) {
        errors.push({
          questionId: q.id,
          reason: "UNKNOWN_QUESTION",
          detail: `Питання ${q.id} посилається на неіснуюче questionId: ${rule.questionId}`,
        });
        continue;
      }

      if (target.order >= q.order) {
        errors.push({
          questionId: q.id,
          reason: "FORWARD_REFERENCE",
          detail: `Питання ${q.id} (order ${q.order}) не може залежати від питання ${target.id}, яке йде не раніше нього (order ${target.order})`,
        });
      }
    }
  }

  // Цикли: DFS з трьома станами (white/gray/black), шукаємо тільки серед
  // валідних ребер (unknown questionId вже зафіксовано вище і в граф не додається)
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const state = new Map<string, number>(questions.map((q) => [q.id, WHITE]));
  const cycleQuestionIds = new Set<string>();

  const dependencies = (id: string): string[] => {
    const q = byId.get(id);
    if (!q?.condition) return [];
    return q.condition.rules
      .map((r) => r.questionId)
      .filter((depId) => byId.has(depId) && depId !== id);
  };

  const dfs = (id: string): boolean => {
    state.set(id, GRAY);
    for (const depId of dependencies(id)) {
      const depState = state.get(depId);
      if (depState === GRAY) {
        cycleQuestionIds.add(id);
        cycleQuestionIds.add(depId);
        return true;
      }
      if (depState === WHITE && dfs(depId)) {
        cycleQuestionIds.add(id);
        return true;
      }
    }
    state.set(id, BLACK);
    return false;
  };

  for (const q of questions) {
    if (state.get(q.id) === WHITE) {
      dfs(q.id);
    }
  }

  for (const id of cycleQuestionIds) {
    errors.push({
      questionId: id,
      reason: "CYCLE",
      detail: `Питання ${id} є частиною циклічної залежності умов`,
    });
  }

  return { valid: errors.length === 0, errors };
};

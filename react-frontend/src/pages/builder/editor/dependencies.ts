import { validateConditionGraph } from "@quorvia/condition-engine";
import type { Question } from "../../../types/formBuilder";

/**
 * Which questions depend on which, for the builder's reorder / delete rules. The rule itself
 * (a condition may only look at EARLIER questions, with no cycles) is the condition-engine's
 * validateConditionGraph, the same function the builder validation and the backend use: nothing is
 * re-implemented here.
 */
type Ordered = Question & { id: string };

const asOrdered = (questions: Question[]): Ordered[] =>
  questions.map((q, order) => ({ ...q, id: q.id ?? `q-${order}`, order }));

// Ids of the questions whose condition is invalid in this arrangement.
const invalidIds = (questions: Question[]): Set<string> =>
  new Set(validateConditionGraph(asOrdered(questions)).errors.map((e) => e.questionId));

// The questions whose condition looks at the question with this id.
export const findDependents = (questions: Question[], questionId: string): Question[] =>
  questions.filter((q) => q.condition?.rules.some((rule) => rule.questionId === questionId));

// Moving a question can put it after a question that depends on it. Returns the questions that
// would have a NEWLY invalid condition after the move (empty: the move is safe). Conditions that
// were already invalid before are not blamed on the move.
export const questionsBrokenByMove = (
  questions: Question[],
  fromIndex: number,
  toIndex: number,
): Question[] => {
  const before = invalidIds(questions);
  const moved = [...questions];
  const [item] = moved.splice(fromIndex, 1);
  moved.splice(toIndex, 0, item);

  const after = invalidIds(moved);
  return moved.filter((q) => q.id && after.has(q.id) && !before.has(q.id));
};

// The explicit result of deleting a question that others depend on: their conditions are
// removed (they become always shown). It is only applied after the author confirmed it.
export const clearConditionsOn = (questions: Question[], questionId: string): Question[] =>
  questions.map((q) =>
    q.condition?.rules.some((rule) => rule.questionId === questionId)
      ? { ...q, condition: null }
      : q,
  );

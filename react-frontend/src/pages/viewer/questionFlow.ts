import { evaluateCondition } from "@quorvia/condition-engine";
import type { Question } from "../../types/formBuilder";
import type { FormAnswers } from "../../types/formViewer";

export const sortByOrder = (questions: Question[]): Question[] =>
  [...questions].sort((a, b) => a.order - b.order);

/**
 * The first question (by order) after afterOrder whose condition (given the current answers) holds.
 * A question without a condition is always reachable. Used for step-by-step navigation
 * (QuestionStepper): each next step is computed dynamically, not from a fixed list, because the
 * answer just given may have opened/closed a branch.
 *
 * The first question of a form (the smallest order) can never have a condition: validateConditionGraph
 * on the backend guarantees it (forward reference), so getNextQuestion(questions, {}, -Infinity)
 * always returns it if the form has any questions.
 */
export const getNextQuestion = (
  orderedQuestions: Question[],
  answers: FormAnswers,
  afterOrder: number,
): Question | null => {
  for (const q of orderedQuestions) {
    if (q.order <= afterOrder) continue;
    if (evaluateCondition(q.condition, answers)) return q;
  }
  return null;
};

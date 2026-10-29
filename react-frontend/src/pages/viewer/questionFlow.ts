import { evaluateCondition } from "@quorvia/condition-engine";
import type { Question } from "../../types/formBuilder";
import type { FormAnswers } from "../../types/formViewer";

export const sortByOrder = (questions: Question[]): Question[] =>
  [...questions].sort((a, b) => a.order - b.order);

/**
 * Перше (за order) питання зі списку, що йде після afterOrder і чия умова
 * (за поточними відповідями) виконується. Питання без condition завжди
 * прохідне. Використовується для покрокової навігації (QuestionStepper) -
 * кожен наступний крок обчислюється динамічно, а не за фіксованим списком,
 * бо саме щойно дана відповідь могла відкрити/закрити гілку.
 *
 * Перше питання форми (order === найменший) ніколи не може мати умову -
 * це гарантує validateConditionGraph на бекенді (forward-reference), тож
 * getNextQuestion(questions, {}, -Infinity) завжди поверне його, якщо
 * питання в формі є взагалі.
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

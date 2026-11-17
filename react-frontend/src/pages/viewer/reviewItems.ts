import { otherAnswerKey } from "@quorvia/shared-types";
import type { Question } from "../../types/formBuilder";
import type { FormAnswers } from "../../types/formViewer";
import { isAnswered } from "./answerProgress";
import { formatReviewAnswer } from "./reviewAnswer";
import type { FieldValidationError } from "./questionValidation";

export interface ReviewItem {
  // The question id: what "Edit" goes back to.
  id: string;
  // 1-based place on the review screen.
  number: number;
  question: string;
  // The answer as text ("No answer" when there is none).
  answer: string;
  answered: boolean;
  // A required question left without an answer: the review marks it and Submit sends the
  // respondent back to it.
  missingRequired: boolean;
}

interface ReviewItemsInput {
  questions: Question[];
  // Answers as the form shows them: with the computed values of calculation fields filled in.
  shownAnswers: FormAnswers;
  // The raw answers, for the "Other" texts.
  answers: FormAnswers;
  // Per-question validation errors (validateAll); optional.
  errors?: Record<string, FieldValidationError>;
  // Translation of a question without text.
  fallbackText: (number: number) => string;
  labels: { yes: string; no: string; empty: string; locale?: string };
  fileName?: (id: string) => string | undefined;
}

// The rows of the "Review your answers" screen, shared by the all-at-once and the step-by-step
// modes so both show an answer the same way.
export const buildReviewItems = ({
  questions,
  shownAnswers,
  answers,
  errors = {},
  fallbackText,
  labels,
  fileName,
}: ReviewItemsInput): ReviewItem[] =>
  questions.map((question, index) => {
    const id = question.id ?? `q-${index}`;
    const value = shownAnswers[id];

    return {
      id,
      number: index + 1,
      question: question.text || fallbackText(index + 1),
      answer: formatReviewAnswer(question, value, answers[otherAnswerKey(id)], {
        ...labels,
        fileName,
      }),
      answered: isAnswered(question, value),
      missingRequired:
        Boolean(question.required) && Boolean(errors[id]) && !isAnswered(question, value),
    };
  });

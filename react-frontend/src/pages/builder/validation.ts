import { validateConditionGraph } from "@quorvia/condition-engine";
import { ErrorCode } from "@quorvia/shared-types";
import type { FormState, Question } from "../../types/formBuilder";
import { findBrokenEndRules } from "./endRules";
import { hasBlockingCategoryIssue, numberNeedsRange } from "./scoring";
import { findCalculationProblems } from "./calculation";

// Values in `errors` are NOT display text but a full i18next translation key
// ("errors.VALIDATION_FIELD_REQUIRED" or "conditionErrors.CYCLE"), the same format for both
// sources, so FormBuilder.tsx can simply do t(errors[key]) without caring where the error came from.
export const validateFormState = (formData: FormState): Record<string, string> => {
  const newErrors: Record<string, string> = {};
  if (!formData.title.trim()) newErrors["title"] = `errors.${ErrorCode.VALIDATION_FIELD_REQUIRED}`;

  formData.questions.forEach((q, index) => {
    if (!q.text.trim()) newErrors[`q-${index}`] = `errors.${ErrorCode.VALIDATION_FIELD_REQUIRED}`;

    // A number that gives points needs a range: the server refuses it otherwise.
    if (numberNeedsRange(q)) newErrors[`q-${index}-score`] = "builder.scoring.numberRange";
  });

  // The server refuses a calculation whose formula does not parse or type-check, reads a question
  // that is gone, or runs in a circle: the builder says which one before sending.
  for (const [index, key] of findCalculationProblems(formData.questions)) {
    newErrors[`q-${index}-formula`] = key;
  }

  // Categories of the score that overlap or run backwards are refused by the server.
  if (hasBlockingCategoryIssue(formData.scoring))
    newErrors["scoring"] = "builder.scoring.errors.categories";

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

  // The server refuses a result rule on a question that was deleted, so the form cannot be saved
  // until the rule is fixed or removed (the rule's card says which).
  for (const index of findBrokenEndRules(
    formData.endRules,
    formData.questions,
    formData.scoring?.enabled === true,
  )) {
    newErrors[`endRule-${index}`] = `errors.${ErrorCode.FORM_INVALID_END_RULES}`;
  }

  return newErrors;
};

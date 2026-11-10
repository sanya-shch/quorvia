import type { ClosedFormFields, PublicFormResponse } from "../../api/publicFormApi";

// The public GET answers with the form, or (for a form that no longer takes answers) with its
// closing reason and no questions.
export const isClosedForm = (form: PublicFormResponse): form is ClosedFormFields =>
  "closedReason" in form;

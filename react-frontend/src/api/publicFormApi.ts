import { type Question } from "../types/formBuilder";
import type { FormAnswers } from "../types/formViewer";
import type { FormTranslations, ResponseMode } from "@quorvia/shared-types";
import { publicApi } from "./axios";

export interface PublicFormFields {
  id: string;
  title: string;
  description?: string;
  responseMode: ResponseMode;
  questions: Question[];
  // Form languages. Optional: a form without them (or a response from an old server) is treated as
  // single-language and shown as before.
  defaultLanguage?: string;
  languages?: string[];
  translations?: FormTranslations | null;
}

export const fetchPublicForm = async (shareId: string): Promise<PublicFormFields> => {
  const response = await publicApi.get(`/forms/public/${shareId}`);
  return response.data;
};

export const submitFormResponses = async (
  shareId: string,
  answers: FormAnswers,
  sessionKey?: string,
  language?: string,
): Promise<void> => {
  const response = await publicApi.post(`/forms/${shareId}/responses`, {
    answers,
    sessionKey,
    language,
  });
  return response.data;
};

export const saveFormAttempt = async (
  shareId: string,
  sessionKey: string,
  answers: FormAnswers,
  reachedQuestionIds?: string[],
): Promise<void> => {
  await publicApi.put(`/forms/${shareId}/attempt`, { sessionKey, answers, reachedQuestionIds });
};

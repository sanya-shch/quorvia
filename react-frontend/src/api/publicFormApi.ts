import { type Question } from "../types/formBuilder";
import type { FormAnswers } from "../types/formViewer";
import type {
  FormClosedReason,
  FormEndScreen,
  FormTheme,
  FormTranslations,
  FormWelcomeScreen,
  ResponseMode,
  UploadedFileDto,
} from "@quorvia/shared-types";
import { publicApi } from "./axios";

// What the public GET returns for a form that no longer takes answers (see ClosedPublicFormDto in
// the backend): enough for a themed "survey closed" page, and no questions.
export interface ClosedFormFields {
  closedReason: FormClosedReason;
  id: string;
  title: string;
  description?: string | null;
  defaultLanguage?: string;
  languages?: string[];
  translations?: FormTranslations | null;
  logoAssetId?: string | null;
  theme?: FormTheme | null;
}

export type PublicFormResponse = PublicFormFields | ClosedFormFields;

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
  logoAssetId?: string | null;
  theme?: FormTheme | null;
  welcomeScreen?: FormWelcomeScreen | null;
  endScreen?: FormEndScreen | null;
}

export const fetchPublicForm = async (shareId: string): Promise<PublicFormResponse> => {
  const response = await publicApi.get(`/forms/public/${shareId}`);
  return response.data;
};

// Uploads one file for a FILE question; the answer to the question is the ids of such files.
export const uploadResponseFile = async (
  shareId: string,
  { sessionKey, questionId, file }: { sessionKey: string; questionId: string; file: File },
): Promise<UploadedFileDto> => {
  const body = new FormData();
  body.append("sessionKey", sessionKey);
  body.append("questionId", questionId);
  body.append("file", file);

  const response = await publicApi.post<UploadedFileDto>(`/forms/${shareId}/files`, body);
  return response.data;
};

// Removes a file that was uploaded in this session and not submitted yet.
export const deleteResponseFile = async (
  shareId: string,
  sessionKey: string,
  fileId: string,
): Promise<void> => {
  await publicApi.delete(`/forms/${shareId}/files/${fileId}`, { params: { sessionKey } });
};

// What the server answers to a submit. `endScreen` is the screen it chose for these answers (a
// matching end rule, else the form's own screen) in the respondent's language; null means "use the
// standard thank-you message". Absent when the server predates conditional end screens.
export interface SubmitResponseResult {
  id: string;
  createdAt: string;
  endScreen?: FormEndScreen | null;
}

export const submitFormResponses = async (
  shareId: string,
  answers: FormAnswers,
  sessionKey?: string,
  language?: string,
): Promise<SubmitResponseResult> => {
  const response = await publicApi.post<SubmitResponseResult>(`/forms/${shareId}/responses`, {
    answers,
    sessionKey,
    language,
  });
  return response.data;
};

// What the server answers to an autosave. `quotaFull` is set when the answers so far fall into a
// quota that is full: the respondent will be turned away at the submit, so they are told now.
// `message` is the owner's text for the respondent (null: the standard one). Absent when the server
// predates quotas.
export interface SaveAttemptResult {
  id: string;
  updatedAt: string;
  quotaFull?: { message: string | null } | null;
}

export const saveFormAttempt = async (
  shareId: string,
  sessionKey: string,
  answers: FormAnswers,
  reachedQuestionIds?: string[],
): Promise<SaveAttemptResult> => {
  const response = await publicApi.put<SaveAttemptResult>(`/forms/${shareId}/attempt`, {
    sessionKey,
    answers,
    reachedQuestionIds,
  });

  return response.data;
};

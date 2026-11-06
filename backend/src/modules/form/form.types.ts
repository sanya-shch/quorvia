import { z } from "zod";
import { createFormSchema, updateFormSchema } from "./form.schema.js";
import { Prisma, Question, ResponseMode } from "@prisma/client";

export type UpdateFormInput = z.infer<typeof updateFormSchema>;
export type CreateFormInput = z.infer<typeof createFormSchema>;

export type FormDto = {
  id: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  isPublished: boolean;
  shareId: string;
  userId: string;
  responseMode: ResponseMode;
  version: number;
  // Language of the form's own fields; languages are the additional ones (without the main).
  defaultLanguage: string;
  languages: string[];
  translations: Prisma.JsonValue | null;
};

export type PublicFormDto = {
  id: string;
  title: string;
  description: string | null;
  responseMode: ResponseMode;
  // All translations are returned at once, so switching the language in the viewer makes no requests.
  defaultLanguage: string;
  languages: string[];
  translations: Prisma.JsonValue | null;
  questions: Question[];
};

export type UserFormsDto = (FormDto & {
  _count: { questions: number; responses: number };
})[];

export type UserFormDto = FormDto & {
  questions: Question[];
  _count: {
    responses: number;
  };
};

import z from "zod";
import type { FormEndScreen } from "@quorvia/shared-types";
import { submitResponseSchema } from "./response.schema.js";

export type Answer = string | number | boolean | string[] | Record<string, string>;
export type Answers = Record<string, Answer>;

export type ResponseDto = {
  id: string;
  createdAt: Date;
  // The end screen the server chose for these answers (a matching end rule, else the form's own
  // screen), in the respondent's language. null: the viewer shows its built-in thank-you message.
  endScreen: FormEndScreen | null;
};

export type submitResponseInput = z.infer<typeof submitResponseSchema>;

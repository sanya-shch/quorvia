import z from "zod";
import { submitResponseSchema } from "./response.schema.js";

export type Answer = string | number | boolean | string[] | Record<string, string>;
export type Answers = Record<string, Answer>;

export type ResponseDto = {
  id: string;
  createdAt: Date;
};

export type submitResponseInput = z.infer<typeof submitResponseSchema>;

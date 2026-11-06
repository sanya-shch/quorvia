// Compile-time checks (nothing runs at runtime). The goal is that adding a question type
// in one place cannot leave the rest of the system inconsistent without a compiler error.
import type { $Enums } from "@prisma/client";
import type { QuestionType } from "@quorvia/shared-types";
import type { z } from "zod";
import type { questionSchema } from "../../modules/form/form.schema.js";

type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// The Prisma enum QuestionType matches the list in shared-types. Adding a value here but
// forgetting the migration/enum in schema.prisma (or the reverse) is an error.
export const prismaEnumMatchesSharedTypes: Equals<$Enums.QuestionType, QuestionType> = true;

// The Zod schema of form questions covers every type (none missing, none extra).
export const formSchemaCoversAllTypes: Equals<
  z.infer<typeof questionSchema>["type"],
  QuestionType
> = true;

/**
 * Перевірки на етапі компіляції (нічого не виконується в рантаймі).
 * Мета - щоб додавання типу питання в одному місці не залишало решту
 * системи в неузгодженому стані без помилки компілятора.
 */
import type { $Enums } from "@prisma/client";
import type { QuestionType } from "@quorvia/shared-types";
import type { z } from "zod";
import type { questionSchema } from "../../modules/form/form.schema.js";

type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Prisma-enum QuestionType збігається зі списком у shared-types. Якщо
// додали значення тут, а міграцію/enum у schema.prisma забули (або навпаки) - помилка.
export const prismaEnumMatchesSharedTypes: Equals<$Enums.QuestionType, QuestionType> = true;

// Zod-схема питань форми покриває кожен тип (без пропущених і зайвих).
export const formSchemaCoversAllTypes: Equals<
  z.infer<typeof questionSchema>["type"],
  QuestionType
> = true;

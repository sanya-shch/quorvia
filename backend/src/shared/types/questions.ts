// import { Question as PrismaQuestion } from '@prisma/client';

import type {
  ConditionGroup,
  QuestionConfig,
  QuestionOption,
  QuestionType,
} from "@quorvia/shared-types";

export type {
  QuestionConfig,
  QuestionDisplayVariant,
  QuestionOption,
  QuestionType,
} from "@quorvia/shared-types";

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  description?: string;
  required: boolean;
  order: number;
  options: QuestionOption[];
  config: QuestionConfig | null;
  condition?: ConditionGroup | null;
}

// export type Question = Omit<PrismaQuestion, 'options' | 'config'> & {
//   options?: QuestionOption[];
//   config?: QuestionConfig;
// };

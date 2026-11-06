import type {
  ConditionGroup,
  FormTranslations,
  QuestionConfig,
  QuestionOption,
  QuestionTranslations,
  QuestionType,
  ResponseMode,
} from "@quorvia/shared-types";

export type {
  ConditionGroup,
  ConditionOperator,
  ConditionRule,
  MatrixRow,
  QuestionConfig,
  QuestionDisplayVariant,
  QuestionOption,
  QuestionType,
  ResponseMode,
} from "@quorvia/shared-types";

export interface Question {
  id?: string;
  type: QuestionType;
  text: string;
  description?: string;
  required: boolean;
  order: number;
  options: QuestionOption[];
  config: QuestionConfig | null;
  condition?: ConditionGroup | null;
  // Question translations by language (see QuestionTranslations); the main language is the fields themselves.
  translations?: QuestionTranslations | null;
}

export interface FormState {
  title: string;
  description: string;
  responseMode: ResponseMode;
  questions: Question[];
  // Content languages. Optional: a state without them (old calls, tests) simply does not send
  // them on save, and the server then changes nothing.
  defaultLanguage?: string;
  // Additional languages (without the main one).
  languages?: string[];
  translations?: FormTranslations | null;
}

// A form from the admin endpoint: FormState plus the version for optimistic locking.
export interface AdminForm extends FormState {
  version: number;
}

// Save body: version is the one the client loaded (the server answers 409 if it is stale).
export type UpdateFormPayload = FormState & { version?: number };

export interface UpdateFormResult {
  success: boolean;
  // The form's new version after saving; the next save must send it.
  version: number;
}

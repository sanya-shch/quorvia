import type { ConditionGroup, ResponseMode } from "@quorvia/shared-types";

export type {
  ConditionGroup,
  ConditionOperator,
  ConditionRule,
  ResponseMode,
} from "@quorvia/shared-types";

export type QuestionType =
  | "TEXT"
  | "CHOICE_SINGLE"
  | "CHOICE_MULTI"
  | "BOOLEAN"
  | "DATE"
  | "NUMBER";

export type QuestionDisplayVariant = "list" | "tabs" | "dropdown";

export interface QuestionOption {
  id: string;
  text: string;
  isDefault: boolean;
}

export interface QuestionConfig {
  variant?: "input" | "textarea" | "email" | "name";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  defaultValue?: boolean;
  displayVariant?: QuestionDisplayVariant;
}

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
}

export interface FormState {
  title: string;
  description: string;
  responseMode: ResponseMode;
  questions: Question[];
}

/** Форма з адмін-ендпоінта: до FormState додається версія для optimistic locking. */
export interface AdminForm extends FormState {
  version: number;
}

/** Тіло збереження: version - та, що клієнт завантажив (сервер відповість 409, якщо вона застаріла). */
export type UpdateFormPayload = FormState & { version?: number };

export interface UpdateFormResult {
  success: boolean;
  /** Нова версія форми після збереження - наступне збереження має слати її. */
  version: number;
}

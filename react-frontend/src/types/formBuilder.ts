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
  /** Переклади питання за мовами (див. QuestionTranslations); основна мова - самі поля. */
  translations?: QuestionTranslations | null;
}

export interface FormState {
  title: string;
  description: string;
  responseMode: ResponseMode;
  questions: Question[];
  /**
   * Мови контенту. Необов'язкові: стан без них (старі виклики, тести) просто
   * не надсилає їх на збереження, а сервер у такому разі нічого не змінює.
   */
  defaultLanguage?: string;
  /** Додаткові мови (без основної). */
  languages?: string[];
  translations?: FormTranslations | null;
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

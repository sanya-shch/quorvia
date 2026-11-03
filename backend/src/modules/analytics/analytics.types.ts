import type { NpsBreakdown, RankingOptionStats } from "@quorvia/shared-types";
import type { Answer, Answers } from "../response/response.types.js";

/**
 * Скільки респондентів бачили це питання взагалі (shownCount, залежить від
 * condition), скільки з тих, хто бачив, все ж не відповіли (skippedCount -
 * можливо тільки для НЕобов'язкових питань, required+видиме завжди
 * відповідається за конструкцією submitResponse), і скільки не бачили його
 * через умову (hiddenCount = totalResponses - shownCount). Присутнє на
 * кожному варіанті QuestionOverview, щоб фронтенд міг відрізнити
 * "приховано умовою" від "показано, але пропущено" - для форм без
 * conditional logic shownCount завжди дорівнює totalResponses.
 */
export type QuestionVisibilityStats = {
  shownCount: number;
  skippedCount: number;
  hiddenCount: number;
};

export type QuestionOverview =
  | ({
      id: string;
      type: "TEXT" | "DATE";
      text: string;
      preview: { value: string; count: number }[];
    } & QuestionVisibilityStats)
  | ({
      id: string;
      type: "NUMBER";
      text: string;
      stats: {
        avg: number;
        min: number;
        max: number;
      };
    } & QuestionVisibilityStats)
  | ({
      id: string;
      type: "CHOICE_SINGLE" | "CHOICE_MULTI";
      text: string;
      distribution: { optionId: string; count: number; text: string }[];
    } & QuestionVisibilityStats)
  | ({
      id: string;
      type: "RATING" | "SCALE" | "NPS";
      text: string;
      /** Середнє/мінімум/максимум серед фактичних відповідей (нулі, якщо відповідей немає). */
      stats: {
        avg: number;
        min: number;
        max: number;
      };
      /** Усі значення шкали від min до max (з нулями), optionId/text - саме значення. */
      distribution: { optionId: string; count: number; text: string }[];
      /** Лише для NPS. */
      nps?: NpsBreakdown;
    } & QuestionVisibilityStats)
  | ({
      id: string;
      type: "RANKING";
      text: string;
      /** По варіанту, у порядку options. */
      ranking: RankingOptionStats[];
      /** Скільки відповідей є повним ранжуванням поточних варіантів. */
      rankedCount: number;
    } & QuestionVisibilityStats)
  | ({
      id: string;
      type: "BOOLEAN";
      text: string;
      trueCount: number;
      falseCount: number;
    } & QuestionVisibilityStats);

export type FormAnalyticsDto = {
  totalResponses: number;
  questions: QuestionOverview[];
};

/**
 * Один вузол шляху проходження форми - питання з кількістю респондентів,
 * що його бачили (shownCount тут еквівалентний QuestionVisibilityStats.shownCount).
 */
export type QuestionPathNode = {
  questionId: string;
  text: string;
  order: number;
  shownCount: number;
};

/**
 * Перехід між двома послідовними ВИДИМИМИ питаннями (у порядку, в якому їх
 * фактично бачив респондент - не обов'язково сусідні за order, якщо
 * проміжні приховані умовою). fromQuestionId: null означає "початок форми"
 * (перехід із стартового стану до першого показаного питання).
 *
 * ВАЖЛИВО: це НЕ funnel-аналітика в класичному сенсі (відсоток тих, хто
 * почав, але не завершив) - Response створюється лише при успішному
 * повному сабміті (submitResponse), проміжні/незавершені проходження зараз
 * ніде не персистяться. Це "популярність гілок" серед ЗАВЕРШЕНИХ відповідей.
 */
export type QuestionPathEdge = {
  fromQuestionId: string | null;
  toQuestionId: string;
  count: number;
};

export type FormPathsDto = {
  totalResponses: number;
  nodes: QuestionPathNode[];
  edges: QuestionPathEdge[];
};

export type QuestionAnalyticsDto =
  | {
      question: {
        id: string;
        text: string;
        description: string | null;
        type: "TEXT" | "DATE";
      };
      totalAnswers: number;
      distribution: { value: string; count: number }[];
      answers: string[];
      /** true, якщо відповідей більше за ліміт і список `answers` обрізано (totalAnswers - повна кількість). */
      answersTruncated?: boolean;
    }
  | {
      question: {
        id: string;
        text: string;
        description: string | null;
        type: "NUMBER";
      };
      totalAnswers: number;
      stats: {
        avg: number;
        min: number;
        max: number;
      };
      distribution: { value: number; count: number }[];
    }
  | {
      question: {
        id: string;
        text: string;
        description: string | null;
        type: "CHOICE_SINGLE" | "CHOICE_MULTI";
      };
      totalAnswers: number;
      distribution: { optionId: string; count: number; text: string }[];
      otherAnswers?: { value: string; count: number }[];
    }
  | {
      question: {
        id: string;
        text: string;
        description: string | null;
        type: "RATING" | "SCALE" | "NPS";
      };
      totalAnswers: number;
      stats: {
        avg: number;
        min: number;
        max: number;
      };
      /** Усі значення шкали від min до max (з нулями). */
      distribution: { value: number; count: number }[];
      /** Лише для NPS. */
      nps?: NpsBreakdown;
    }
  | {
      question: {
        id: string;
        text: string;
        description: string | null;
        type: "RANKING";
      };
      totalAnswers: number;
      ranking: RankingOptionStats[];
      rankedCount: number;
    }
  | {
      question: {
        id: string;
        text: string;
        description: string | null;
        type: "BOOLEAN";
      };
      totalAnswers: number;
      trueCount: number;
      falseCount: number;
    };

export type ResponseListItem = {
  id: string;
  createdAt: Date;
  answersPreview?: Record<string, unknown>;
};

export type ResponseListDto = {
  total: number;
  page: number;
  limit: number;
  data: ResponseListItem[];
};

export type GetResponsesQuery = {
  page?: string;
  limit?: string;
};

export interface EnrichedAnswer {
  questionId: string;
  questionText: string;
  questionType: string;
  questionDescription: string | null;
  questionRequired: boolean;
  displayValue: string | number | string[];
  rawValue: Answer;
}

export type ResponseDetailsDto = {
  id: string;
  formId: string;
  createdAt: Date;
  answers: EnrichedAnswer[];
};

/**
 * Справжня funnel-аналітика (на відміну від FormPathsDto/QuestionPathEdge,
 * які показують популярність гілок лише серед ЗАВЕРШЕНИХ відповідей) -
 * рахується з ResponseAttempt (autosave-чернетки), тому враховує і
 * покинуті проходження, не лише успішні сабміти.
 *
 * reachedCount на кожному питанні = скільки attempts (завершених чи ні)
 * мали це питання у своєму visibleQuestionIds хоч раз - тобто дійсно його
 * побачили, з урахуванням conditional branching.
 *
 * Навмисно НЕ розрізняємо "покинув" від "ще активно заповнює" за жодним
 * часовим порогом - completedAt: null означає лише "ще не завершено",
 * без додаткової інтерпретації. totalAttempts - totalCompletions і є
 * "не завершили" в широкому сенсі, саме те число, яке просив показати
 * запит на 'справжню funnel-аналітику'.
 */
export type QuestionFunnelNode = {
  questionId: string;
  text: string;
  order: number;
  reachedCount: number;
};

export type FormFunnelDto = {
  totalAttempts: number;
  totalCompletions: number;
  completionRate: number;
  nodes: QuestionFunnelNode[];
};

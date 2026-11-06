import type { MatrixStats, NpsBreakdown, RankingOptionStats } from "@quorvia/shared-types";
import type { Answer, Answers } from "../response/response.types.js";

/**
 * How many respondents saw this question at all (shownCount, depends on the condition),
 * how many of those still did not answer (skippedCount, possible only for optional
 * questions: a required visible question is always answered by construction of
 * submitResponse), and how many did not see it because of the condition
 * (hiddenCount = totalResponses - shownCount). Present on every QuestionOverview variant
 * so frontends can tell "hidden by a condition" from "shown but skipped"; for forms
 * without conditional logic shownCount always equals totalResponses.
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
      // Average/min/max over the actual answers (zeros when there are none).
      stats: {
        avg: number;
        min: number;
        max: number;
      };
      // Every scale value from min to max (zeros included); optionId/text is the value itself.
      distribution: { optionId: string; count: number; text: string }[];
      // NPS only.
      nps?: NpsBreakdown;
    } & QuestionVisibilityStats)
  | ({
      id: string;
      type: "RANKING";
      text: string;
      // Per option, in option order.
      ranking: RankingOptionStats[];
      // How many answers are a full ranking of the current options.
      rankedCount: number;
    } & QuestionVisibilityStats)
  | ({
      id: string;
      type: "MATRIX";
      text: string;
      matrix: MatrixStats;
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

// One node of the form's path: a question with the number of respondents who saw it
// (shownCount is equivalent to QuestionVisibilityStats.shownCount).
export type QuestionPathNode = {
  questionId: string;
  text: string;
  order: number;
  shownCount: number;
};

/**
 * A transition between two consecutive VISIBLE questions, in the order the respondent
 * actually saw them (not necessarily adjacent by `order` when the ones in between are
 * hidden by a condition). fromQuestionId: null means "start of the form".
 *
 * This is NOT funnel analytics (the share of respondents who started but did not
 * finish): it only covers COMPLETED responses, i.e. how popular each branch is. The
 * funnel is FormFunnelDto below, computed from ResponseAttempt.
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
      // true when there are more answers than the limit and the `answers` list is truncated (totalAnswers is the full count).
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
      // Every scale value from min to max (zeros included).
      distribution: { value: number; count: number }[];
      // NPS only.
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
        type: "MATRIX";
      };
      totalAnswers: number;
      matrix: MatrixStats;
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
  // Form language the respondent used (null: unknown).
  language: string | null;
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
  language: string | null;
  answers: EnrichedAnswer[];
};

/**
 * The real funnel (unlike FormPathsDto/QuestionPathEdge, which only show branch
 * popularity among COMPLETED responses). It is computed from ResponseAttempt
 * (autosaved drafts), so it also counts abandoned sessions, not just submits.
 *
 * reachedCount per question is how many attempts (completed or not) really saw the
 * question at least once (reachedQuestionIds), with conditional branching taken into account.
 *
 * We deliberately do NOT tell "abandoned" from "still filling in" with any time
 * threshold: completedAt: null only means "not finished yet". totalAttempts -
 * totalCompletions is the "did not finish" number in the broad sense.
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

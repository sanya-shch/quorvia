import { normalizeScoring } from "@quorvia/shared-types";
import type { ExportData } from "./exporter.types.js";

// The score columns of an export: the total, the best total possible for that respondent, and the
// category. They are there when the form scores now, or when any response was scored (scoring may
// have been switched off after the responses came in; their scores are still data). A form that
// never scored gets no extra columns.
export const SCORE_HEADERS = {
  score: "Бали",
  maxScore: "Максимум балів",
  category: "Категорія результату",
} as const;

export interface ScoreCells {
  score: number | "";
  maxScore: number | "";
  category: string;
}

export interface ScoreExport {
  cellsFor: (response: ExportData["responses"][number]) => ScoreCells;
}

export const scoreExport = (data: ExportData): ScoreExport | null => {
  const scoring = normalizeScoring(data.form.scoring);

  if (!scoring?.enabled && !data.responses.some((r) => r.score !== null)) return null;

  const labels = new Map((scoring?.categories ?? []).map((c) => [c.id, c.label]));

  return {
    cellsFor: (response) => ({
      score: response.score ?? "",
      maxScore: response.maxScore ?? "",
      // A deleted category is named by nobody now; the cell is empty rather than showing an id.
      category: (response.scoreCategoryId && labels.get(response.scoreCategoryId)) || "",
    }),
  };
};

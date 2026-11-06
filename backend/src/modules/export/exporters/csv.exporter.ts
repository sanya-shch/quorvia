import { otherAnswerKey } from "@quorvia/shared-types";
import { ExportData, Exporter, GeneratedFile } from "./exporter.types.js";
import { AnswerValue, formatAnswer, slugifyFileName } from "./formatAnswer.js";

/**
 * CSV/formula injection: anonymous respondents type the answers, and the form owner opens
 * the file in Excel/Sheets/LibreOffice. A cell starting with = + - @ (or TAB/CR) is
 * interpreted as a formula (`=HYPERLINK(...)`, `=cmd|' /C calc'!A0`), so such a cell gets a
 * leading apostrophe and stays text. Ordinary negative numbers (`-5`, `-3.14`) are left
 * alone, otherwise legitimate data would be damaged.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const PLAIN_NEGATIVE_NUMBER = /^-\d+(\.\d+)?$/;

export const neutralizeFormula = (value: string): string =>
  FORMULA_TRIGGER.test(value) && !PLAIN_NEGATIVE_NUMBER.test(value) ? `'${value}` : value;

const escapeCsvCell = (rawValue: string): string => {
  const value = neutralizeFormula(rawValue);

  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const toCsvRow = (cells: string[]): string => cells.map(escapeCsvCell).join(",");

export const exportToCsv: Exporter = async (data: ExportData): Promise<GeneratedFile> => {
  const questions = [...data.questions].sort((a, b) => a.order - b.order);

  const header = ["Дата надсилання", ...questions.map((q) => q.text)];

  const rows = data.responses.map((response) => {
    const answers = response.answers as Record<string, AnswerValue>;

    const cells = [
      response.createdAt.toLocaleString("uk-UA"),
      ...questions.map((q) => formatAnswer(q, answers[q.id], answers[otherAnswerKey(q.id)])),
    ];

    return toCsvRow(cells);
  });

  const csvContent = ["\uFEFF" + toCsvRow(header), ...rows].join("\r\n");

  return {
    buffer: Buffer.from(csvContent, "utf-8"),
    fileName: `${slugifyFileName(data.form.title)}-responses.csv`,
    mimeType: "text/csv; charset=utf-8",
  };
};

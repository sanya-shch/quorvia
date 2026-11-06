import { Question } from "@prisma/client";
import { assertNever, type QuestionConfig } from "@quorvia/shared-types";

// The answer to "Other" is a separate key in answers; the exporter receives it as the third argument.

export type AnswerValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string>
  | null
  | undefined;

const optionLabelsById = (question: Question, otherText?: AnswerValue): Record<string, string> => {
  const options = Array.isArray(question.options)
    ? (question.options as { id: string; text: string; isOther?: boolean }[])
    : [];

  return Object.fromEntries(
    options.map((o) => [
      o.id,
      // "Other: custom option": the export column shows both the choice and the text.
      o.isOther && typeof otherText === "string" && otherText ? `${o.text}: ${otherText}` : o.text,
    ]),
  );
};

export const formatAnswer = (
  question: Question,
  value: AnswerValue,
  otherText?: AnswerValue,
): string => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  switch (question.type) {
    case "BOOLEAN":
      return value ? "Так" : "Ні";
    case "CHOICE_SINGLE":
    case "CHOICE_MULTI": {
      const labels = optionLabelsById(question, otherText);
      const ids = Array.isArray(value) ? value : [value as string];
      return ids.map((id) => labels[id] ?? String(id)).join("; ");
    }
    case "MATRIX": {
      // "Row: Column; Row: Column": rows in question order, unanswered ones skipped (an optional
      // matrix may be filled partially).
      const rows = (question.config as QuestionConfig | null)?.rows ?? [];
      const labels = optionLabelsById(question);
      const cells =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, string>)
          : {};

      return rows
        .filter((row) => cells[row.id] !== undefined)
        .map((row) => `${row.text}: ${labels[cells[row.id]] ?? cells[row.id]}`)
        .join("; ");
    }
    case "RANKING": {
      // "1. Coffee; 2. Tea": the position is visible within a single export cell.
      const labels = optionLabelsById(question);
      const ids = Array.isArray(value) ? value : [value as string];
      return ids.map((id, i) => `${i + 1}. ${labels[id] ?? String(id)}`).join("; ");
    }
    case "TEXT":
    case "DATE":
    case "NUMBER":
    case "RATING":
    case "SCALE":
    case "NPS":
      // General formatting below (scales are exported as the raw number so they can be summed
      // and charted in a spreadsheet).
      break;
    default:
      return assertNever(question.type, "question type");
  }

  if (Array.isArray(value)) {
    return value.join("; ");
  }

  if (question.type === "DATE" && typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("uk-UA");
  }

  return String(value);
};

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ю: "iu",
  я: "ia",
  "'": "",
};

const transliterate = (input: string): string =>
  input
    .toLowerCase()
    .split("")
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join("");

export const slugifyFileName = (title: string): string => {
  const transliterated = transliterate(title)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const slug = transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "form";
};

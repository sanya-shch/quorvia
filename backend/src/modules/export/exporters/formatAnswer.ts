import { Question } from "@prisma/client";
import { assertNever } from "@quorvia/shared-types";

// Відповідь на «Інше» - окремий ключ в answers; експортер передає його третім аргументом.

export type AnswerValue = string | number | boolean | string[] | null | undefined;

const optionLabelsById = (question: Question, otherText?: AnswerValue): Record<string, string> => {
  const options = Array.isArray(question.options)
    ? (question.options as { id: string; text: string; isOther?: boolean }[])
    : [];

  return Object.fromEntries(
    options.map((o) => [
      o.id,
      // "Інше: свій варіант" - у колонці експорту видно і вибір, і текст.
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
    case "RANKING": {
      // "1. Кава; 2. Чай" - позиція видна в одній клітинці експорту.
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
      // Загальне форматування нижче (шкали експортуються сирим числом -
      // так їх можна сумувати й будувати графіки в таблиці).
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

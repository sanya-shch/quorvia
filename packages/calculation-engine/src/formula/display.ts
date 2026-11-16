/**
 * The builder shows a formula with question names instead of ids: `{q:3f9a…}` is written
 * `[[Plan]]`. The stored formula keeps the id, so renaming a question never breaks it. These
 * functions convert both ways and carry the position of an error from the stored text to the shown
 * one. A reference inside a string literal is plain text and is never converted.
 */

export const MAX_LABEL_LENGTH = 40;

export interface ReferenceLabels {
  labelById: ReadonlyMap<string, string>;
  idByLabel: ReadonlyMap<string, string>;
}

const cleanLabel = (text: string): string =>
  text
    .replace(/[[\]\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL_LENGTH)
    .trim();

/**
 * One unique label per question, in the order of the list: the question's text (no brackets, at
 * most 40 characters), "Untitled N" style text for an empty one, and "#2", "#3" for repeats.
 */
export const referenceLabels = (
  questions: readonly { id: string; text: string }[],
  untitled: (position: number) => string = (position) => `Question ${position}`,
): ReferenceLabels => {
  const labelById = new Map<string, string>();
  const idByLabel = new Map<string, string>();
  const used = new Map<string, number>();

  questions.forEach((question, index) => {
    const base = cleanLabel(question.text) || untitled(index + 1);
    const count = (used.get(base) ?? 0) + 1;

    used.set(base, count);

    const label = count === 1 ? base : `${base} #${count}`;

    labelById.set(question.id, label);
    idByLabel.set(label, question.id);
  });

  return { labelById, idByLabel };
};

interface Segment {
  rawStart: number;
  rawEnd: number;
  shownStart: number;
  shownEnd: number;
}

// Calls `onToken` for every piece of the text that is not inside a string literal and starts with
// `open`; returns the text with the replacements.
const rewrite = (
  text: string,
  match: (at: number) => { length: number; replacement: string } | null,
): { text: string; segments: Segment[] } => {
  let out = "";
  let i = 0;
  const segments: Segment[] = [];

  while (i < text.length) {
    const ch = text[i]!;

    if (ch === '"') {
      // A string literal: copied as it is, up to the closing quote (an escaped quote does not close it).
      let j = i + 1;

      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;

      const end = Math.min(j + 1, text.length);

      out += text.slice(i, end);
      i = end;
      continue;
    }

    const found = match(i);

    if (found) {
      segments.push({
        rawStart: i,
        rawEnd: i + found.length,
        shownStart: out.length,
        shownEnd: out.length + found.replacement.length,
      });
      out += found.replacement;
      i += found.length;
      continue;
    }

    out += ch;
    i += 1;
  }

  return { text: out, segments };
};

const STORED_REF = /^\{q:([A-Za-z0-9_-]{1,64})\}/;
const SHOWN_REF = /^\[\[([^[\]\r\n]{1,80})\]\]/;

export interface ShownFormula {
  text: string;
  // Where a position (and the end of a range) of the stored formula is in the shown text.
  mapPosition: (position: number, isEnd?: boolean) => number;
}

/** The stored formula as the author reads it: `{q:id}` becomes `[[Label]]` when the label is known. */
export const formulaToShown = (stored: string, labels: ReferenceLabels): ShownFormula => {
  const { text, segments } = rewrite(stored, (at) => {
    const match = STORED_REF.exec(stored.slice(at, at + 80));
    const label = match ? labels.labelById.get(match[1]!) : undefined;

    return match && label !== undefined
      ? { length: match[0].length, replacement: `[[${label}]]` }
      : null;
  });

  return {
    text,
    mapPosition: (position, isEnd = false) => {
      let delta = 0;

      for (const segment of segments) {
        if (segment.rawEnd <= position)
          delta += segment.shownEnd - segment.shownStart - (segment.rawEnd - segment.rawStart);
        else if (segment.rawStart < position) return isEnd ? segment.shownEnd : segment.shownStart;
      }

      return position + delta;
    },
  };
};

/** The reverse: `[[Label]]` becomes `{q:id}` when the label belongs to a question; anything else stays. */
export const shownToFormula = (shown: string, labels: ReferenceLabels): string =>
  rewrite(shown, (at) => {
    const match = SHOWN_REF.exec(shown.slice(at, at + 90));
    const id = match ? labels.idByLabel.get(match[1]!.trim()) : undefined;

    return match && id !== undefined ? { length: match[0].length, replacement: `{q:${id}}` } : null;
  }).text;

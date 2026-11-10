// The form's closing moment is stored as an instant (ISO 8601, UTC); the author edits it in their
// own time zone through <input type="datetime-local">, which has no zone of its own.

const pad = (n: number): string => String(n).padStart(2, "0");

// "2026-06-01T10:00:00.000Z" -> "2026-06-01T13:00" in the browser's zone; "" for nothing/invalid.
export const isoToLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return "";

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// "2026-06-01T13:00" (browser's zone) -> "2026-06-01T10:00:00.000Z"; null for empty/invalid.
export const localInputToIso = (value: string): string | null => {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

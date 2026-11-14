import { useState } from "react";
import { parseScoreValue, scoreToText } from "../scoring";

interface ScoreInputProps {
  id?: string;
  label: string;
  // The points as stored: null or undefined for none.
  value: number | null | undefined;
  // Called with a valid number, or null when the field is emptied. Text that is not usable (not a
  // number, out of range, too many decimals) is kept in the field, marked invalid, and not reported.
  onChange: (value: number | null) => void;
  className?: string;
}

const base =
  "h-9 w-24 rounded-lg border px-2 text-sm text-slate-800 focus:outline-none focus:ring-1";

// A field for points. It keeps what is being typed ("-", "1.", "0,5") as text, because a number
// input cannot hold a half-typed value, and only reports values that are valid.
export default function ScoreInput({
  id,
  label,
  value,
  onChange,
  className = "",
}: ScoreInputProps) {
  const [text, setText] = useState(scoreToText(value));
  const [seen, setSeen] = useState(value);

  // The value changed (the parent echoed what was typed, or it changed from outside): show it,
  // unless the field already reads the same number ("5.0" stays "5.0" for the value 5).
  if (seen !== value) {
    setSeen(value);

    const parsed = parseScoreValue(text);

    if (parsed === undefined || (parsed ?? null) !== (value ?? null)) setText(scoreToText(value));
  }

  const invalid = parseScoreValue(text) === undefined;

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={text}
      aria-label={label}
      aria-invalid={invalid}
      placeholder="0"
      onChange={(e) => {
        const next = e.target.value;
        const parsed = parseScoreValue(next);

        setText(next);

        if (parsed !== undefined) onChange(parsed);
      }}
      className={`${base} ${
        invalid
          ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500"
          : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
      } ${className}`}
    />
  );
}

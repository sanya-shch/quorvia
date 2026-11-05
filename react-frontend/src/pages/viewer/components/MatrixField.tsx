import { useTranslation } from "react-i18next";
import type { MatrixRow, QuestionOption } from "../../../types/formBuilder";
import type { AnswerValue, MatrixAnswerValue } from "../../../types/formViewer";
import { toMatrixAnswer } from "../matrixAnswer";

interface MatrixFieldProps {
  /** Префікс імені груп радіокнопок (qId): кожен рядок - окрема група. */
  name: string;
  rows: MatrixRow[];
  columns: QuestionOption[];
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  required: boolean;
  labelledBy?: string;
  describedBy?: string;
  invalid?: boolean;
}

/**
 * Матриця як набір груп "рядок -> колонка" (fieldset на рядок), а не HTML-таблиця:
 * так одна й та сама розмітка однаково працює на вузьких екранах і зі
 * скрінрідерами (легенда = текст рядка, радіокнопки = колонки), без дубльованої
 * мобільної версії.
 */
export default function MatrixField({
  name,
  rows,
  columns,
  value,
  onChange,
  required,
  labelledBy,
  describedBy,
  invalid,
}: MatrixFieldProps) {
  const { t } = useTranslation();
  const cells = toMatrixAnswer(value);
  const answeredCount = rows.filter((row) => cells[row.id] !== undefined).length;

  const select = (rowId: string, columnId: string) => {
    const next: MatrixAnswerValue = { ...cells, [rowId]: columnId };
    onChange(next);
  };

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className="space-y-5"
    >
      {rows.map((row) => (
        <fieldset key={row.id} className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">{row.text}</legend>

          <div className="flex flex-wrap gap-2">
            {columns.map((column) => {
              const selected = cells[row.id] === column.id;

              return (
                <label key={column.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`${name}:${row.id}`}
                    value={column.id}
                    checked={selected}
                    onChange={() => select(row.id, column.id)}
                    className="peer sr-only"
                  />
                  <span
                    className={`flex min-h-10 items-center rounded-xl border px-3 text-sm font-medium transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 ${
                      selected
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {column.text}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {!required && answeredCount > 0 && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs font-medium text-slate-500 underline hover:text-slate-600 cursor-pointer"
        >
          {t("viewer.matrix.clear")}
        </button>
      )}
    </div>
  );
}

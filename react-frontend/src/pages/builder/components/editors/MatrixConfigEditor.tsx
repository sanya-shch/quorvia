import { useTranslation } from "react-i18next";
import { MATRIX_LIMITS } from "@quorvia/shared-types";
import type { MatrixRow, QuestionOption } from "../../../../types/formBuilder";

interface MatrixConfigEditorProps {
  rows: MatrixRow[];
  /** Колонки матриці - це options питання. */
  columns: QuestionOption[];
  onChangeRows: (rows: MatrixRow[]) => void;
  onChangeColumns: (columns: QuestionOption[]) => void;
}

const LIKERT_KEYS = [
  "stronglyDisagree",
  "disagree",
  "neutral",
  "agree",
  "stronglyAgree",
] as const;

const newId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const inputClass =
  "flex-1 min-w-0 h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const removeClass =
  "rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400";
const addClass =
  "inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-500 bg-indigo-50/50 hover:bg-indigo-50 px-3 py-2 rounded-xl border border-dashed border-indigo-200 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

const CloseIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth="2"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export default function MatrixConfigEditor({
  rows,
  columns,
  onChangeRows,
  onChangeColumns,
}: MatrixConfigEditorProps) {
  const { t } = useTranslation();

  const updateRow = (id: string, text: string) =>
    onChangeRows(rows.map((row) => (row.id === id ? { ...row, text } : row)));
  const updateColumn = (id: string, text: string) =>
    onChangeColumns(columns.map((column) => (column.id === id ? { ...column, text } : column)));

  const addRow = () =>
    onChangeRows([
      ...rows,
      {
        id: newId("row"),
        text: t("builder.editors.matrix.newRowText", { number: rows.length + 1 }),
      },
    ]);
  const addColumn = () =>
    onChangeColumns([
      ...columns,
      {
        id: newId("opt"),
        text: t("builder.editors.matrix.newColumnText", { number: columns.length + 1 }),
        isDefault: false,
      },
    ]);

  // Шкала Лайкерта - готовий набір колонок. Колонки отримують нові id, тож
  // відповіді, зібрані на старі колонки, перестануть зіставлятися.
  const applyLikert = () =>
    onChangeColumns(
      LIKERT_KEYS.map((key) => ({
        id: newId("opt"),
        text: t(`builder.editors.matrix.likert.${key}`),
        isDefault: false,
      })),
    );

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-150">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-slate-500">
          {t("builder.editors.matrix.rowsLabel")}
        </span>

        {rows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">
              {index + 1}
            </span>
            <input
              type="text"
              value={row.text}
              onChange={(e) => updateRow(row.id, e.target.value)}
              maxLength={500}
              aria-label={t("builder.editors.matrix.rowAria", { number: index + 1 })}
              placeholder={t("builder.editors.matrix.rowPlaceholder")}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => onChangeRows(rows.filter((r) => r.id !== row.id))}
              disabled={rows.length <= MATRIX_LIMITS.minRows}
              aria-label={t("builder.editors.matrix.removeRow", { number: index + 1 })}
              className={removeClass}
            >
              <CloseIcon />
            </button>
          </div>
        ))}

        <div>
          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= MATRIX_LIMITS.maxRows}
            className={addClass}
          >
            {t("builder.editors.matrix.addRow")}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-slate-500">
          {t("builder.editors.matrix.columnsLabel")}
        </span>

        {columns.map((column, index) => (
          <div key={column.id} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">
              {index + 1}
            </span>
            <input
              type="text"
              value={column.text}
              onChange={(e) => updateColumn(column.id, e.target.value)}
              maxLength={500}
              aria-label={t("builder.editors.matrix.columnAria", { number: index + 1 })}
              placeholder={t("builder.editors.matrix.columnPlaceholder")}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => onChangeColumns(columns.filter((c) => c.id !== column.id))}
              disabled={columns.length <= MATRIX_LIMITS.minColumns}
              aria-label={t("builder.editors.matrix.removeColumn", { number: index + 1 })}
              className={removeClass}
            >
              <CloseIcon />
            </button>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addColumn}
            disabled={columns.length >= MATRIX_LIMITS.maxColumns}
            className={addClass}
          >
            {t("builder.editors.matrix.addColumn")}
          </button>
          <button
            type="button"
            onClick={applyLikert}
            className="inline-flex items-center text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-xl border border-dashed border-slate-300 transition-all cursor-pointer"
          >
            {t("builder.editors.matrix.applyLikert")}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400">{t("builder.editors.matrix.hint")}</p>
    </div>
  );
}

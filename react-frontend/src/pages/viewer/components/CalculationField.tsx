import { useTranslation } from "react-i18next";
import { formatCalcValue, type CalcValue } from "@quorvia/calculation-engine";
import type { Question } from "../../../types/formBuilder";

interface CalculationFieldProps {
  question: Question;
  qId: string;
  // The computed value; undefined or null when it could not be computed.
  value: CalcValue | null | undefined;
  labelledBy?: string;
}

// A calculation field: the respondent does not type anything, they read the value. `output` is the
// element for a computed result; it is announced politely when it changes.
export default function CalculationField({
  question,
  qId,
  value,
  labelledBy,
}: CalculationFieldProps) {
  const { i18n } = useTranslation();
  const config = question.config;

  return (
    <output
      id={qId}
      aria-labelledby={labelledBy}
      aria-live="polite"
      className="block rounded-xl bg-slate-50 px-4 py-3 text-2xl font-bold tabular-nums text-slate-900"
    >
      {formatCalcValue(
        value,
        {
          resultType: config?.resultType ?? "number",
          decimals: config?.decimals,
          prefix: config?.prefix,
          suffix: config?.suffix,
        },
        i18n.language,
      )}
    </output>
  );
}

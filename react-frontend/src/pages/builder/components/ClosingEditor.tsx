import { useId } from "react";
import { useTranslation } from "react-i18next";
import { MAX_RESPONSES_LIMIT, getClosedReason } from "@quorvia/shared-types";
import { isoToLocalInput, localInputToIso } from "../closing";

interface ClosingEditorProps {
  closesAt: string | null | undefined;
  maxResponses: number | null | undefined;
  // How many responses the form has collected (read-only, from the server).
  responseCount: number | undefined;
  onChange: (change: { closesAt?: string | null; maxResponses?: number | null }) => void;
}

const inputClass =
  "mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

// When the form stops taking answers: at a moment, after a number of responses, or whichever comes
// first. The server makes the final decision (atomically, when a response arrives); this only
// edits the two limits and shows where the form stands.
export default function ClosingEditor({
  closesAt,
  maxResponses,
  responseCount,
  onChange,
}: ClosingEditorProps) {
  const { t } = useTranslation();
  const id = useId();

  const count = responseCount ?? 0;
  const closedReason = getClosedReason({ closesAt, maxResponses, responseCount: count });
  const hasPastDate = Boolean(closesAt) && closedReason === "DATE";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-slate-600">{t("builder.closing.label")}</p>
        <p className="mt-0.5 text-xs text-slate-500">{t("builder.closing.hint")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-date`} className="block text-xs font-semibold text-slate-600">
            {t("builder.closing.date")}
          </label>
          <input
            id={`${id}-date`}
            type="datetime-local"
            value={isoToLocalInput(closesAt)}
            onChange={(e) => onChange({ closesAt: localInputToIso(e.target.value) })}
            className={`${inputClass} w-full`}
          />
          <p className="mt-1 text-xs text-slate-500">{t("builder.closing.dateHint")}</p>
        </div>

        <div>
          <label htmlFor={`${id}-max`} className="block text-xs font-semibold text-slate-600">
            {t("builder.closing.max")}
          </label>
          <input
            id={`${id}-max`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_RESPONSES_LIMIT}
            step={1}
            value={maxResponses ?? ""}
            placeholder={t("builder.closing.maxPlaceholder")}
            onChange={(e) => {
              const raw = e.target.value;
              const number = Number(raw);

              onChange({
                maxResponses:
                  raw === "" || !Number.isInteger(number) || number < 1
                    ? null
                    : Math.min(number, MAX_RESPONSES_LIMIT),
              });
            }}
            className={`${inputClass} w-full`}
          />
          <p className="mt-1 text-xs text-slate-500">
            {t("builder.closing.collected", { count, max: maxResponses ?? "∞" })}
          </p>
        </div>
      </div>

      {closedReason && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800"
        >
          {t(
            closedReason === "DATE"
              ? "builder.closing.closedByDate"
              : "builder.closing.closedByLimit",
          )}
          {hasPastDate && ` ${t("builder.closing.pastDateHint")}`}
        </p>
      )}
    </div>
  );
}

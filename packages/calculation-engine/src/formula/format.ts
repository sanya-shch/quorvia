import { FORMULA_LIMITS, type CalcValue, type CalculationConfig } from "./types.js";

/** What a computed field shows when it has no value (a failed or empty calculation). */
export const NO_VALUE = "—";

/**
 * A computed value as the respondent reads it: a number with exactly `decimals` places (59.90, not
 * 59.9), grouped and with the language's separators, plus the field's prefix and suffix ("$", "€").
 * The server uses it for the end screen text and the viewer for the live value, so both agree.
 */
export const formatCalcValue = (
  value: CalcValue | null | undefined,
  config: Pick<CalculationConfig, "resultType" | "decimals" | "prefix" | "suffix">,
  locale?: string | null,
): string => {
  if (value === null || value === undefined) return NO_VALUE;

  const affix = (text: string): string => `${config.prefix ?? ""}${text}${config.suffix ?? ""}`;

  if (typeof value === "boolean") {
    const uk = (locale ?? "").toLowerCase().startsWith("uk");

    return affix(value ? (uk ? "Так" : "Yes") : uk ? "Ні" : "No");
  }

  if (typeof value === "string") return affix(value);

  const decimals = config.decimals ?? FORMULA_LIMITS.defaultDecimals;

  try {
    return affix(
      new Intl.NumberFormat(locale ?? "en", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: true,
      }).format(value),
    );
  } catch {
    // An unknown locale tag: plain digits.
    return affix(value.toFixed(decimals));
  }
};

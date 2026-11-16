import { Decimal } from "decimal.js";

// One configured Decimal constructor for the whole formula engine. Money arithmetic must be exact
// in decimal: 0.1 + 0.2 is 0.3 and ROUND(2.675, 2) is 2.68 (plain floats give 0.30000000000000004
// and 2.67). Rounding is "half away from zero", the same rule scoring uses for hundredths.
export const D = Decimal.clone({
  // Significant digits kept by division; + - * are exact within the overflow guard below.
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  // The sign of a remainder follows the dividend, like JavaScript's %.
  modulo: Decimal.ROUND_DOWN,
  // Never switch to exponent notation, so toString() / toFixed() are always plain digits.
  toExpNeg: -1e9,
  toExpPos: 1e9,
});

export type Dec = Decimal;

// Intermediate results above this are an overflow (null result) instead of ever-growing numbers.
export const MAX_INTERMEDIATE = new D("1e30");

// A stored number must survive a trip through a JSON double unchanged: at most 15 significant
// digits (always exact in a double) and a magnitude below 1e15.
export const MAX_RESULT = new D("1e15");
export const MAX_RESULT_DIGITS = 15;

export const ROUND_HALF_UP = Decimal.ROUND_HALF_UP;
export const ROUND_FLOOR = Decimal.ROUND_FLOOR;
export const ROUND_CEIL = Decimal.ROUND_CEIL;

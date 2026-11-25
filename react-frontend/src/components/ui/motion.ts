/**
 * Small helpers shared by the JS-driven animations (the toast, count-up numbers).
 *
 * Timing is NOT hard-coded here: it lives in the `--motion-*` custom properties in index.css, the
 * one place that CSS animations, this code and the Vue analytics remote all read. The numbers
 * below are only fallbacks for an environment without those styles (tests, a stripped page).
 */

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Reads a duration token such as `--motion-duration-count` ("800ms" or "0.8s") in milliseconds. */
export const motionDurationMs = (token: string, fallbackMs: number): number => {
  if (typeof document === "undefined") return fallbackMs;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallbackMs;
  if (raw.endsWith("ms")) return value;
  if (raw.endsWith("s")) return value * 1000;
  return fallbackMs;
};

/** Fast start, long soft landing: the usual feel of a number that counts up. */
export const easeOutExpo = (progress: number): number =>
  progress >= 1 ? 1 : 1 - 2 ** (-10 * progress);

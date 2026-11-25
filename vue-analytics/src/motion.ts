/**
 * Helpers for the JS-driven animations of the analytics remote (the count-up numbers).
 *
 * A mirror of react-frontend/src/components/ui/motion.ts: the remote is built and can run on its
 * own, so it cannot import from the host. Timing is not hard-coded here: it is read from the
 * `--motion-*` custom properties the host defines on :root (the remote mounts into the host's DOM,
 * so it sees them); the numbers below are fallbacks for standalone mode and tests.
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

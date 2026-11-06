import { animate } from "motion/mini";

/**
 * Toast animations through motion/mini (WAAPI, ~3 kB gzip). Toast is in the main bundle, so the
 * full motion with AnimatePresence (~28 kB gzip) is deliberately not used here: it loads only with
 * the lazy public-form route.
 *
 * The animation is progressive enhancement, not a requirement: the function NEVER throws and never
 * hangs. If WAAPI is missing (an old browser, jsdom), or the animation was cancelled or failed,
 * the promise just resolves and the message appears/disappears without the effect.
 */
export type ToastPhase = "enter" | "exit";

const DURATION_S: Record<ToastPhase, number> = { enter: 0.22, exit: 0.15 };

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const playToastAnimation = async (element: HTMLElement, phase: ToastPhase): Promise<void> => {
  if (typeof element.animate !== "function") return;

  // prefers-reduced-motion: no movement, only opacity.
  const movement = prefersReducedMotion()
    ? {}
    : {
        transform:
          phase === "enter"
            ? ["translateY(24px) scale(0.96)", "translateY(0) scale(1)"]
            : ["scale(1)", "scale(0.96)"],
      };

  try {
    await animate(
      element,
      { opacity: phase === "enter" ? [0, 1] : [1, 0], ...movement },
      { duration: DURATION_S[phase], ease: phase === "enter" ? "easeOut" : "easeIn" },
    ).finished;
  } catch {
    // Cancelled or unsupported: not critical.
  }
};

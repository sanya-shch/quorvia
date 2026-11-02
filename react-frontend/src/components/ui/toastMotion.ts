import { animate } from "motion/mini";

/**
 * Анімації Toast через motion/mini (WAAPI, ~3 кБ gzip). Toast лежить у
 * головному бандлі, тому тут навмисно не повний motion з AnimatePresence
 * (~28 кБ gzip): він завантажується лише з лінивим маршрутом публічної форми.
 *
 * Анімація - поступове покращення, а не умова працездатності: функція НІКОЛИ
 * не кидає помилку й не зависає. Немає WAAPI (старий браузер, jsdom), анімацію
 * скасовано або вона впала - проміс просто завершується, і повідомлення
 * з'являється/зникає без ефекту.
 */
export type ToastPhase = "enter" | "exit";

const DURATION_S: Record<ToastPhase, number> = { enter: 0.22, exit: 0.15 };

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const playToastAnimation = async (element: HTMLElement, phase: ToastPhase): Promise<void> => {
  if (typeof element.animate !== "function") return;

  // prefers-reduced-motion: без руху - лише прозорість.
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
    // Скасовано або не підтримується - не критично.
  }
};

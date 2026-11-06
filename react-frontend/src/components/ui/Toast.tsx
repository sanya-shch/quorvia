import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { playToastAnimation } from "./toastMotion";

/**
 * A small central notification mechanism instead of window.alert(): alert blocks the thread,
 * cannot be styled, does not localize its button and is not read by screen readers in sequence
 * with the rest of the UI.
 *
 * Appearance and disappearance are animated with motion/mini (see toastMotion.ts): a message
 * slides in from below and on close shrinks and fades; the element is removed from the DOM
 * after the exit animation. With prefers-reduced-motion only opacity is left, no movement. The
 * animation is progressive enhancement: without its support the message just appears and
 * disappears, and roles and screen reader texts do not change.
 *
 * Accessibility: success is role="status" (polite announcement), an error is role="alert"
 * (immediate). Errors stay longer than successes so they can be read, and all can be closed
 * with a button.
 */
export type ToastKind = "success" | "error";

// leaving: the message is closing; it plays the exit animation and is then removed.
type ToastItem = { id: number; kind: ToastKind; message: string; leaving?: boolean };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const AUTO_DISMISS_MS: Record<ToastKind, number> = { success: 4000, error: 8000 };
// More than that pushes the oldest out: nobody needs a stack of ten messages.
const MAX_VISIBLE = 4;

const ToastContext = createContext<ToastApi | null>(null);

function ToastView({
  toast,
  closeLabel,
  onDismiss,
  onRemove,
}: {
  toast: ToastItem;
  closeLabel: string;
  onDismiss: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) void playToastAnimation(ref.current, "enter");
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!toast.leaving || !element) return;

    let cancelled = false;
    void playToastAnimation(element, "exit").then(() => {
      if (cancelled) return;
      // We set the final state manually: between the end of the animation and removing the element
      // React may render a frame in which it would still be visible.
      element.style.opacity = "0";
      onRemove(toast.id);
    });

    return () => {
      cancelled = true;
    };
  }, [toast.leaving, toast.id, onRemove]);

  return (
    <div
      ref={ref}
      role={toast.kind === "error" ? "alert" : "status"}
      className={`flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
        toast.leaving ? "pointer-events-none" : "pointer-events-auto"
      } ${
        toast.kind === "error"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={closeLabel}
        className="-m-1 cursor-pointer rounded p-1 text-current opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  // Final removal from the DOM (after the exit animation).
  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  // Starts closing: repeated calls (timer + click) are harmless.
  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) =>
      current.map((toast) => (toast.id === id && !toast.leaving ? { ...toast, leaving: true } : toast)),
    );
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;

      // Evicted toasts (older than MAX_VISIBLE) disappear at once without animation; their timers
      // remain and simply will not find the element.
      setToasts((current) => [...current, { id, kind, message }].slice(-MAX_VISIBLE));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS[kind]),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => show("success", message),
      error: (message) => show("error", message),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
        data-testid="toast-region"
      >
        {toasts.map((toast) => (
          <ToastView
            key={toast.id}
            toast={toast}
            closeLabel={t("common.close")}
            onDismiss={dismiss}
            onRemove={remove}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast має викликатись усередині <ToastProvider>");
  return api;
}

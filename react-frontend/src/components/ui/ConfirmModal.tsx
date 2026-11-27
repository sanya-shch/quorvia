import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    cancelButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/40 backdrop-blur-sm motion-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl motion-dialog">
        <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <p id="modal-description" className="mt-2 text-sm text-slate-500 leading-relaxed">
          {description}
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-semibold text-on-solid hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm"
          >
            {confirmLabel ?? t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

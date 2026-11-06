import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { type FormSummary } from "../../../types/form";

interface FormCardMenuProps {
  form: FormSummary;
  onDelete: () => void;
  onTogglePublish: () => void;
  onDuplicate: () => void;
  onCopyLink: () => void;
  onAnalytics: () => void;
}

export default function FormCardMenu({
  form,
  onDelete,
  onTogglePublish,
  onDuplicate,
  onCopyLink,
  onAnalytics,
}: FormCardMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation(); // stop the click from navigating to the builder
          setIsOpen(!isOpen);
        }}
        aria-label={t("dashboard.menu.open")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5 z-20 animate-in fade-in slide-in-from-top-1 duration-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopyLink();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {t("dashboard.menu.copyLink")}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAnalytics();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {t("dashboard.menu.analytics")}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePublish();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {form.isPublished ? t("dashboard.menu.unpublish") : t("dashboard.menu.publish")}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {t("dashboard.menu.duplicate")}
          </button>
          <hr className="my-1 border-slate-100" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
          >
            {t("dashboard.menu.delete")}
          </button>
        </div>
      )}
    </div>
  );
}

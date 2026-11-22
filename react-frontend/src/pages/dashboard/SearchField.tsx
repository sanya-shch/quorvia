import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import AppIcon from "../../components/ui/AppIcon";

// The forms search in the top bar. Ctrl/Cmd+K focuses it from anywhere on the page, unless the
// user is typing in another field (then the shortcut is theirs to ignore, never to hijack).
export default function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <label className="relative block max-w-xl">
      <span className="sr-only">{t("dashboard.search.label")}</span>
      <AppIcon
        name="search"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("dashboard.search.placeholder")}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-14 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 sm:block">
        Ctrl K
      </kbd>
    </label>
  );
}

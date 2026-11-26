import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { getTheme, setTheme, subscribeTheme, type Theme } from "../../theme/theme";
import AppIcon from "./AppIcon";

/**
 * A small sun/moon button that sits quietly next to the language switch. The new theme is revealed
 * as a circle growing from the button (see setTheme).
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const theme = useSyncExternalStore(subscribeTheme, getTheme, (): Theme => "light");
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = t(next === "dark" ? "theme.switchToDark" : "theme.switchToLight");

  return (
    <button
      type="button"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setTheme(next, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }}
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${className}`.trim()}
    >
      <AppIcon name={theme === "dark" ? "sun" : "moon"} className="h-4 w-4" />
    </button>
  );
}

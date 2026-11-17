import { useTranslation } from "react-i18next";
import { CheckCircleIcon } from "./viewerIcons";
import type { SaveStatus } from "../hooks/useAttemptAutosave";

// "Saved automatically" / "Saving..." / "All answers saved": tells the respondent their progress
// is kept. The text is hidden on narrow screens (the icon stays), and it is a polite live region
// so a screen reader hears the status change without being interrupted.
export default function SaveIndicator({ status }: { status: SaveStatus }) {
  const { t } = useTranslation();

  return (
    <p
      aria-live="polite"
      className={`flex items-center gap-1.5 text-xs font-semibold ${
        status === "saving" ? "text-slate-500" : "text-emerald-700"
      }`}
    >
      <CheckCircleIcon className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">{t(`viewer.save.${status}`)}</span>
    </p>
  );
}

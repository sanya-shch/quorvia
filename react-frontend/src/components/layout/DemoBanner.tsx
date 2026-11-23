import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/useAuthStore";

const MINUTE_MS = 60 * 1000;

// "5 h 12 min left" for a demo account, recalculated every minute. Nothing for a regular account.
export default function DemoBanner() {
  const { t } = useTranslation();
  const expiresAt = useAuthStore((state) => state.user?.demo?.expiresAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) return null;

  const minutesLeft = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / MINUTE_MS));

  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6 lg:px-8"
    >
      <span className="font-semibold">{t("shell.demo.label")}</span>
      {" · "}
      {t("shell.demo.timeLeft", {
        hours: Math.floor(minutesLeft / 60),
        minutes: minutesLeft % 60,
      })}
      {" · "}
      {t("shell.demo.note")}
    </div>
  );
}

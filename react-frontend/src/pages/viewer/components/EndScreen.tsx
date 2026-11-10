import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isHttpUrl, type FormEndScreen } from "@quorvia/shared-types";
import { redirectTo } from "../navigation";

// How long the respondent can read the message before being sent on.
export const REDIRECT_DELAY_SECONDS = 5;

interface EndScreenProps {
  screen: FormEndScreen | null | undefined;
}

// The page after a successful submit: the author's message (or the standard thank-you text) and,
// when the author set one, an automatic redirect. The destination is checked again here, so even
// data that bypassed validation can only ever lead to an http(s) page.
export default function EndScreen({ screen }: EndScreenProps) {
  const { t } = useTranslation();
  const redirectUrl = isHttpUrl(screen?.redirectUrl) ? screen.redirectUrl : null;
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_DELAY_SECONDS);

  useEffect(() => {
    if (!redirectUrl) return;

    const timer = window.setInterval(() => {
      setSecondsLeft((current) => current - 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [redirectUrl]);

  useEffect(() => {
    if (redirectUrl && secondsLeft <= 0) redirectTo(redirectUrl);
  }, [redirectUrl, secondsLeft]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-surface rounded-2xl border border-slate-200 p-8 text-center shadow-sm animate-in fade-in zoom-in-95 duration-200">
        <div className="h-12 w-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>

        {screen ? (
          <p role="status" className="text-lg font-semibold text-slate-800 whitespace-pre-line">
            {screen.text}
          </p>
        ) : (
          <>
            <h2 className="text-xl font-bold text-slate-800">{t("viewer.thankYou.title")}</h2>
            <p className="text-sm text-slate-500 mt-2">{t("viewer.thankYou.subtitle")}</p>
          </>
        )}

        {redirectUrl && (
          <p className="mt-5 text-sm text-slate-500">
            {t("viewer.endScreen.redirecting", { count: Math.max(secondsLeft, 0) })}{" "}
            <a
              href={redirectUrl}
              rel="noopener noreferrer"
              className="font-semibold text-indigo-600 underline hover:text-indigo-500"
            >
              {t("viewer.endScreen.continueNow")}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

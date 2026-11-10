import { useTranslation } from "react-i18next";
import type { FormWelcomeScreen } from "@quorvia/shared-types";
import FormLogo from "./FormLogo";

interface WelcomeScreenProps {
  screen: FormWelcomeScreen;
  logoUrl?: string;
  onStart: () => void;
}

// Shown before the first question. The form behind it is not rendered yet, so nothing can be
// answered (or autosaved) before the respondent presses the button.
export default function WelcomeScreen({ screen, logoUrl, onStart }: WelcomeScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="max-w-xl w-full bg-surface rounded-2xl border border-slate-200 p-8 sm:p-10 text-center shadow-sm animate-in fade-in zoom-in-95 duration-200">
        {logoUrl && (
          <div className="flex justify-center">
            <FormLogo url={logoUrl} />
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{screen.title}</h1>
        {screen.text && (
          <p className="mt-3 text-sm sm:text-base text-slate-500 whitespace-pre-line">
            {screen.text}
          </p>
        )}
        <button
          type="button"
          onClick={onStart}
          autoFocus
          className="mt-8 inline-flex h-12 items-center justify-center rounded-xl bg-indigo-600 px-8 text-base font-semibold text-on-primary shadow-sm hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 cursor-pointer transition-colors"
        >
          {screen.buttonLabel || t("viewer.welcome.start")}
        </button>
      </div>
    </div>
  );
}

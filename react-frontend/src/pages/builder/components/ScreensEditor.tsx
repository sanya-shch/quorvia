import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  SCREEN_LIMITS,
  isHttpUrl,
  type FormEndScreen,
  type FormWelcomeScreen,
} from "@quorvia/shared-types";

interface ScreensEditorProps {
  formTitle: string;
  welcomeScreen: FormWelcomeScreen | null | undefined;
  endScreen: FormEndScreen | null | undefined;
  onWelcomeChange: (screen: FormWelcomeScreen | null) => void;
  onEndChange: (screen: FormEndScreen | null) => void;
}

const inputClass =
  "w-full rounded-xl border px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const labelClass = "block text-xs font-semibold text-slate-600";

interface ToggleProps {
  id: string;
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

function Toggle({ id, checked, label, onChange }: ToggleProps) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
      />
      {label}
    </label>
  );
}

// The author's welcome screen (shown before the first question) and end screen (shown after a
// successful submit, with an optional redirect). A screen exists while its checkbox is on.
// Translations of the texts are edited in the language tabs, like the rest of the form.
export default function ScreensEditor({
  formTitle,
  welcomeScreen,
  endScreen,
  onWelcomeChange,
  onEndChange,
}: ScreensEditorProps) {
  const { t } = useTranslation();
  const id = useId();

  const redirectUrl = endScreen?.redirectUrl ?? "";
  // Anything typed that is not a full http(s) address is not saved (see the builder's payload),
  // so say so while the author is typing.
  const redirectInvalid = redirectUrl.trim() !== "" && !isHttpUrl(redirectUrl.trim());

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Toggle
          id={`${id}-welcome`}
          checked={Boolean(welcomeScreen)}
          label={t("builder.screens.welcome.enable")}
          // Starts from the form title: the most common welcome heading.
          onChange={(on) =>
            onWelcomeChange(on ? { title: formTitle, text: "", buttonLabel: "" } : null)
          }
        />

        {welcomeScreen && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <label htmlFor={`${id}-welcome-title`} className={labelClass}>
                {t("builder.screens.welcome.title")}
              </label>
              <input
                id={`${id}-welcome-title`}
                type="text"
                value={welcomeScreen.title}
                maxLength={SCREEN_LIMITS.title}
                aria-invalid={welcomeScreen.title.trim() === ""}
                onChange={(e) => onWelcomeChange({ ...welcomeScreen, title: e.target.value })}
                className={`${inputClass} mt-1 border-slate-200`}
              />
              {welcomeScreen.title.trim() === "" && (
                <p role="alert" className="mt-1 text-xs font-medium text-amber-700">
                  {t("builder.screens.welcome.titleRequired")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor={`${id}-welcome-text`} className={labelClass}>
                {t("builder.screens.welcome.text")}
              </label>
              <textarea
                id={`${id}-welcome-text`}
                rows={3}
                value={welcomeScreen.text ?? ""}
                maxLength={SCREEN_LIMITS.text}
                onChange={(e) => onWelcomeChange({ ...welcomeScreen, text: e.target.value })}
                className={`${inputClass} mt-1 border-slate-200`}
              />
            </div>

            <div>
              <label htmlFor={`${id}-welcome-button`} className={labelClass}>
                {t("builder.screens.welcome.button")}
              </label>
              <input
                id={`${id}-welcome-button`}
                type="text"
                value={welcomeScreen.buttonLabel ?? ""}
                maxLength={SCREEN_LIMITS.buttonLabel}
                placeholder={t("builder.screens.welcome.buttonPlaceholder")}
                onChange={(e) => onWelcomeChange({ ...welcomeScreen, buttonLabel: e.target.value })}
                className={`${inputClass} mt-1 border-slate-200 sm:w-64`}
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Toggle
          id={`${id}-end`}
          checked={Boolean(endScreen)}
          label={t("builder.screens.end.enable")}
          onChange={(on) => onEndChange(on ? { text: "", redirectUrl: "" } : null)}
        />

        {endScreen && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <label htmlFor={`${id}-end-text`} className={labelClass}>
                {t("builder.screens.end.text")}
              </label>
              <textarea
                id={`${id}-end-text`}
                rows={3}
                value={endScreen.text}
                maxLength={SCREEN_LIMITS.text}
                aria-invalid={endScreen.text.trim() === ""}
                onChange={(e) => onEndChange({ ...endScreen, text: e.target.value })}
                className={`${inputClass} mt-1 border-slate-200`}
              />
              {endScreen.text.trim() === "" && (
                <p role="alert" className="mt-1 text-xs font-medium text-amber-700">
                  {t("builder.screens.end.textRequired")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor={`${id}-end-redirect`} className={labelClass}>
                {t("builder.screens.end.redirect")}
              </label>
              <input
                id={`${id}-end-redirect`}
                type="url"
                inputMode="url"
                spellCheck={false}
                value={redirectUrl}
                maxLength={SCREEN_LIMITS.redirectUrl}
                placeholder="https://example.com/thanks"
                aria-invalid={redirectInvalid}
                onChange={(e) => onEndChange({ ...endScreen, redirectUrl: e.target.value })}
                className={`${inputClass} mt-1 ${redirectInvalid ? "border-rose-500" : "border-slate-200"}`}
              />
              {redirectInvalid ? (
                <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
                  {t("builder.screens.end.redirectInvalid")}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  {t("builder.screens.end.redirectHint")}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

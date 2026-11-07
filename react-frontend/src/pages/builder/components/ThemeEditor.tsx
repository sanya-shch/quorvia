import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FORM_FONTS,
  FORM_RADII,
  FORM_THEME_MODES,
  THEME_COLOR_PATTERN,
  normalizeTheme,
  type FormTheme,
} from "@quorvia/shared-types";
import { DEFAULT_PALETTES, getThemeWarnings, resolveTheme } from "../../viewer/theme/theme";
import { useThemeFont } from "../../viewer/theme/fonts";
import ThemePreview from "./ThemePreview";

interface ThemeEditorProps {
  theme: FormTheme | null | undefined;
  onChange: (theme: FormTheme | null) => void;
}

type ColorKey = "primaryColor" | "backgroundColor" | "textColor";

const COLOR_KEYS: ColorKey[] = ["primaryColor", "backgroundColor", "textColor"];

const PALETTE_KEY = {
  primaryColor: "primary",
  backgroundColor: "background",
  textColor: "text",
} as const;

const segmentClass = (active: boolean) =>
  `px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
    active ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-800"
  }`;

interface ColorFieldProps {
  id: string;
  label: string;
  value: string;
  isCustom: boolean;
  onCommit: (value: string) => void;
  onReset: () => void;
}

function ColorField({ id, label, value, isCustom, onCommit, onReset }: ColorFieldProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [seenValue, setSeenValue] = useState(value);

  // Follows changes that did not come from typing here (the color picker, a reset, a mode switch).
  if (value !== seenValue) {
    setSeenValue(value);
    setDraft(value);
  }

  const isValid = THEME_COLOR_PATTERN.test(draft);

  return (
    <div>
      <label htmlFor={`${id}-hex`} className="block text-xs font-semibold text-slate-600">
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="color"
          aria-label={t("builder.theme.picker", { color: label })}
          value={value}
          onChange={(e) => onCommit(e.target.value)}
          className="h-9 w-10 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
        />
        <input
          id={`${id}-hex`}
          type="text"
          value={draft}
          maxLength={7}
          spellCheck={false}
          aria-invalid={!isValid}
          onChange={(e) => {
            setDraft(e.target.value);
            if (THEME_COLOR_PATTERN.test(e.target.value)) onCommit(e.target.value);
          }}
          className={`h-9 w-24 rounded-lg border px-2 font-mono text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            isValid ? "border-slate-200" : "border-rose-500"
          }`}
        />
        {isCustom && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-slate-600 hover:text-indigo-700 cursor-pointer"
          >
            {t("builder.theme.useDefault")}
          </button>
        )}
      </div>
      {!isValid && (
        <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
          {t("builder.theme.colorInvalid")}
        </p>
      )}
    </div>
  );
}

export default function ThemeEditor({ theme, onChange }: ThemeEditorProps) {
  const { t } = useTranslation();
  const resolved = resolveTheme(theme);
  const warnings = getThemeWarnings(theme);
  const mode = theme?.mode ?? "light";

  // The font is needed in the editor too: the preview shows it.
  useThemeFont(resolved.font);

  const update = (patch: Partial<FormTheme>) => onChange(normalizeTheme({ ...(theme ?? {}), ...patch }));

  const removeKey = (key: ColorKey) => {
    const next = { ...(theme ?? {}) };
    delete next[key];
    onChange(normalizeTheme(next));
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-slate-600">{t("builder.theme.label")}</p>
        <p className="text-xs text-slate-500 mt-0.5">{t("builder.theme.hint")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-slate-600">{t("builder.theme.mode.label")}</p>
            <div className="mt-1.5 flex w-fit gap-2 rounded-xl bg-slate-100 p-1">
              {FORM_THEME_MODES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={mode === option}
                  onClick={() => update({ mode: option })}
                  className={segmentClass(mode === option)}
                >
                  {t(`builder.theme.mode.${option}`)}
                </button>
              ))}
            </div>
          </div>

          {COLOR_KEYS.map((key) => (
            <ColorField
              key={key}
              id={`theme-${key}`}
              label={t(`builder.theme.colors.${key}`)}
              value={resolved.palette[PALETTE_KEY[key]]}
              isCustom={theme?.[key] !== undefined}
              onCommit={(value) => update({ [key]: value })}
              onReset={() => removeKey(key)}
            />
          ))}

          <div>
            <label htmlFor="theme-font" className="block text-xs font-semibold text-slate-600">
              {t("builder.theme.font.label")}
            </label>
            <select
              id="theme-font"
              value={resolved.font}
              onChange={(e) => update({ font: e.target.value as FormTheme["font"] })}
              className="mt-1.5 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {FORM_FONTS.map((font) => (
                <option key={font} value={font}>
                  {t(`builder.theme.font.${font}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-600">{t("builder.theme.radius.label")}</p>
            <div className="mt-1.5 flex w-fit flex-wrap gap-2 rounded-xl bg-slate-100 p-1">
              {FORM_RADII.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={resolved.radius === option}
                  onClick={() => update({ radius: option })}
                  className={segmentClass(resolved.radius === option)}
                >
                  {t(`builder.theme.radius.${option}`)}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!theme}
            onClick={() => onChange(null)}
            className="text-xs font-bold text-rose-600 hover:text-rose-700 disabled:text-slate-500 disabled:cursor-not-allowed cursor-pointer"
          >
            {t("builder.theme.reset")}
          </button>
        </div>

        <div className="space-y-3">
          <ThemePreview theme={theme} />

          {warnings.length > 0 && (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-800">{t("builder.theme.warnings.title")}</p>
              <ul className="mt-1 list-disc pl-4 text-xs text-amber-800 space-y-1">
                {warnings.map((warning) => (
                  <li key={warning}>{t(`builder.theme.warnings.${warning}`)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Re-exported for tests: the palette a mode starts from.
export { DEFAULT_PALETTES };

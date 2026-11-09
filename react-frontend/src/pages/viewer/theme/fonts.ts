import { useEffect } from "react";
import type { FormFont } from "@quorvia/shared-types";

// Fonts ship with the app (@fontsource packages, served from our own origin): no request to
// Google Fonts or any third party, which also keeps the CSP (font-src 'self') intact. Only the
// Latin and Cyrillic subsets are bundled, and each font is a lazy chunk loaded when selected.
const loaders: Record<FormFont, (() => Promise<unknown>) | null> = {
  system: null,
  inter: () =>
    Promise.all([
      import("@fontsource/inter/latin-400.css"),
      import("@fontsource/inter/latin-700.css"),
      import("@fontsource/inter/cyrillic-400.css"),
      import("@fontsource/inter/cyrillic-700.css"),
    ]),
  lora: () =>
    Promise.all([
      import("@fontsource/lora/latin-400.css"),
      import("@fontsource/lora/latin-700.css"),
      import("@fontsource/lora/cyrillic-400.css"),
      import("@fontsource/lora/cyrillic-700.css"),
    ]),
  "jetbrains-mono": () =>
    Promise.all([
      import("@fontsource/jetbrains-mono/latin-400.css"),
      import("@fontsource/jetbrains-mono/latin-700.css"),
      import("@fontsource/jetbrains-mono/cyrillic-400.css"),
      import("@fontsource/jetbrains-mono/cyrillic-700.css"),
    ]),
};

export const loadFont = (font: FormFont): Promise<unknown> =>
  loaders[font]?.() ?? Promise.resolve();

// Loads the font files for the selected font. The stack has a system fallback, so a failed
// load only means the fallback stays.
export const useThemeFont = (font: FormFont): void => {
  useEffect(() => {
    void loadFont(font).catch(() => undefined);
  }, [font]);
};

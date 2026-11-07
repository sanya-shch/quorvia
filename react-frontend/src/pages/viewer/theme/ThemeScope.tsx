import { useMemo, type ReactNode } from "react";
import { normalizeTheme } from "@quorvia/shared-types";
import { resolveTheme, themeStyle } from "./theme";
import { useThemeFont } from "./fonts";
import "./viewerTheme.css";

interface ThemeScopeProps {
  // Anything the server or the builder holds: it is normalized here again before use.
  theme: unknown;
  className?: string;
  children: ReactNode;
}

// Applies a form theme to everything inside. A form without a theme renders its children
// untouched, so the default look cannot be affected by this feature.
export default function ThemeScope({ theme, className = "", children }: ThemeScopeProps) {
  const safeTheme = useMemo(() => normalizeTheme(theme), [theme]);
  const resolved = useMemo(() => resolveTheme(safeTheme), [safeTheme]);

  useThemeFont(resolved.font);

  if (!safeTheme) return <>{children}</>;

  return (
    <div
      className={`q-theme ${className}`.trim()}
      data-q-radius={resolved.radius}
      style={themeStyle(resolved)}
    >
      {children}
    </div>
  );
}

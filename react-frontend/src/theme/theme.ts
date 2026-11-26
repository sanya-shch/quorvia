import { flushSync } from "react-dom";
import { motionDurationMs, prefersReducedMotion } from "../components/ui/motion";

export type Theme = "light" | "dark";

// The inline script in index.html reads the same key before the first paint (so the page never
// flashes the wrong theme); theme.contract.test.ts keeps the two equal.
export const THEME_STORAGE_KEY = "quorvia-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";
// The browser chrome on mobile: the brand color in the light theme, the page color in the dark one.
const BROWSER_CHROME: Record<Theme, string> = { light: "#4f46e5", dark: "#262624" };
const THEME_REVEAL_FALLBACK_MS = 650;

const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark";

/** The theme the person picked, or null while they have not picked one (then the system decides). */
export const readStoredTheme = (): Theme | null => {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
};

const writeStoredTheme = (theme: Theme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or a full quota: the theme still applies for this visit.
  }
};

export const systemTheme = (): Theme =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(DARK_QUERY).matches
    ? "dark"
    : "light";

/** The theme on the page now: <html data-theme> (set before the first paint), else the stored/system one. */
export const getTheme = (): Theme => {
  const attribute =
    typeof document === "undefined" ? undefined : document.documentElement.dataset.theme;
  return isTheme(attribute) ? attribute : (readStoredTheme() ?? systemTheme());
};

const listeners = new Set<() => void>();

/** For useSyncExternalStore: the theme is owned by <html>, not by React state. */
export const subscribeTheme = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Puts the theme on the page (no storing: that is the person's choice, see setTheme). */
export const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", BROWSER_CHROME[theme]);
  listeners.forEach((listener) => listener());
};

interface ViewTransitionLike {
  ready: Promise<unknown>;
}
type StartViewTransition = (update: () => void) => ViewTransitionLike;

const viewTransitionStarter = (): StartViewTransition | null => {
  const start = (document as unknown as { startViewTransition?: StartViewTransition })
    .startViewTransition;
  return typeof start === "function" ? start.bind(document) : null;
};

/**
 * The person's choice: it is stored and applied. With an origin (the center of the button that was
 * pressed) the new theme is revealed as a circle growing from it, through the View Transitions API;
 * without the API, without an origin or with prefers-reduced-motion the theme just switches.
 */
export const setTheme = (next: Theme, origin?: { x: number; y: number }): void => {
  writeStoredTheme(next);

  const startViewTransition = origin ? viewTransitionStarter() : null;
  if (!origin || !startViewTransition || prefersReducedMotion()) {
    applyTheme(next);
    return;
  }

  const { x, y } = origin;
  // As far as the farthest corner, so the circle always covers the whole page.
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  // flushSync: the new snapshot must already hold the new icon of the button.
  const transition = startViewTransition(() => flushSync(() => applyTheme(next)));
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: motionDurationMs("--motion-duration-theme", THEME_REVEAL_FALLBACK_MS),
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    // The transition is skipped when another one starts or the tab is hidden: nothing to animate.
    .catch(() => undefined);
};

/** While the person has not chosen, a change of the system theme changes the app's one too. */
export const followSystemTheme = (): (() => void) => {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(DARK_QUERY);
  const onChange = () => {
    if (!readStoredTheme()) applyTheme(systemTheme());
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** Called once before the first render; the inline script in index.html has already set the attribute. */
export const initTheme = (): (() => void) => {
  applyTheme(getTheme());
  return followSystemTheme();
};

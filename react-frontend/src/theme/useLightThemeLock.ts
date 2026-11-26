import { useLayoutEffect } from "react";

/**
 * Pins the whole page to the light theme while the component is mounted. The public form is the
 * author's design, shown to respondents who never chose the app's theme: it must not follow it.
 * (A direct visit is pinned before the first paint by the inline script in index.html.)
 */
export function useLightThemeLock(): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.themeLock = "light";
    return () => {
      delete root.dataset.themeLock;
    };
  }, []);
}

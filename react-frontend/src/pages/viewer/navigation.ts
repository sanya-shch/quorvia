// The one place that leaves the application for an address chosen by a form author. Kept apart
// so tests can replace it (jsdom cannot navigate) and so there is a single guard to audit.
import { isHttpUrl } from "@quorvia/shared-types";

// Returns false (and does nothing) for anything that is not an absolute http(s) URL.
export const redirectTo = (url: unknown): boolean => {
  if (!isHttpUrl(url)) return false;

  window.location.assign(url);

  return true;
};

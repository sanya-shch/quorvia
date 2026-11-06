const STORAGE_PREFIX = "quorvia:attempt:";

/**
 * One sessionKey per (shareId, browser tab). sessionStorage on purpose, not localStorage: a new tab
 * is a new "visit" for the funnel, while a page reload in the SAME tab must continue the same
 * attempt instead of starting a new one (otherwise the funnel would count one respondent as
 * several on every accidental refresh).
 */
export function getOrCreateSessionKey(shareId: string): string {
  const key = `${STORAGE_PREFIX}${shareId}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;

  const generated = crypto.randomUUID();
  sessionStorage.setItem(key, generated);
  return generated;
}

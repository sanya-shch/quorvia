const STORAGE_PREFIX = "quorvia:attempt:";

/**
 * Один sessionKey на (shareId, вкладка браузера) - sessionStorage
 * навмисно, не localStorage: нова вкладка = новий "заход" для
 * funnel-цілей, а оновлення сторінки в межах ТІЄЇ САМОЇ вкладки має
 * продовжити той самий attempt, а не почати новий (інакше funnel рахував
 * би одного респондента як кількох при кожному випадковому refresh).
 */
export function getOrCreateSessionKey(shareId: string): string {
  const key = `${STORAGE_PREFIX}${shareId}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;

  const generated = crypto.randomUUID();
  sessionStorage.setItem(key, generated);
  return generated;
}

/**
 * Recently used tools, kept per device in localStorage. This is a convenience
 * only: storage can be missing (private mode, blocked site data), so every
 * read and write is guarded and an empty list is always a valid answer.
 *
 * Read it after mount, never during render, or the server and client trees
 * differ (HYD-1).
 */

const STORAGE_KEY = 'aiarchitek-recent-tools';
const MAX_ITEMS = 6;

function readRaw(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Most recent first, without duplicates, capped at MAX_ITEMS. */
export function pushRecent(list: string[], id: string, max = MAX_ITEMS): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

export function getRecentToolIds(): string[] {
  if (typeof window === 'undefined') return [];
  return readRaw();
}

export function recordToolVisit(id: string): void {
  if (typeof window === 'undefined') return;
  const current = readRaw();
  if (current[0] === id) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pushRecent(current, id)));
  } catch {
    // Storage full or blocked: recent tools just will not show.
  }
}

/** Recent Inspiration searches, per device. A nicety: every failure returns []. */
const KEY = 'inspiration:recent';
const MAX = 5;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readRecent(store: KeyValueStore | null): string[] {
  if (!store) return [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecent(store: KeyValueStore | null, query: string): string[] {
  const clean = query.trim().slice(0, 100);
  if (!clean) return readRecent(store);
  const next = [clean, ...readRecent(store).filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(0, MAX);
  try {
    store?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: the list simply is not remembered.
  }
  return next;
}

export function safeLocalStorage(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

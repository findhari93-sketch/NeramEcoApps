const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export function cacheData<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    localStorage.setItem(`wa_${key}`, JSON.stringify(entry));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function getCachedData<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`wa_${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(`wa_${key}`);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

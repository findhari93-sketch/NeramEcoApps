'use client';

/**
 * Keeps the SWR cache on the device, so a screen the teacher has already seen paints
 * from the first frame instead of from a skeleton.
 *
 * SWR's own cache is a plain in-memory Map. It already survives unmounting, which is
 * what makes tab switches inside the class panel instant, but it dies with the tab.
 * Every reload, every cold open of the installed app, and every "I closed it on the
 * bus" therefore started from nothing, and the teacher watched the same skeletons they
 * watched yesterday.
 *
 * ## Why localStorage and not IndexedDB
 *
 * IndexedDB is the obvious storage for this and it is the wrong tool here. SWR's
 * `provider` must hand back a Map-like object *synchronously*, before the first render,
 * because that first render is exactly the frame we are trying to fill. IndexedDB is
 * async, so a provider built on it is necessarily empty on frame one and populates a
 * beat later, which is the skeleton flash we are removing. localStorage reads
 * synchronously, so the cache is genuinely warm before React draws anything.
 *
 * The price is the ~5MB origin quota, handled by the caps below.
 */

/** Bumped when the persisted shape changes, so old entries are ignored not misread. */
const PREFIX = 'nexus_swr_cache_v1';

/**
 * Total budget for the serialised cache. Comfortably under the usual 5MB origin quota,
 * leaving room for the auth cache and anything else the app stores.
 */
const MAX_TOTAL_BYTES = 2_000_000;

/**
 * Any single response bigger than this is served but never written. One enormous
 * payload (a full question bank, a term of attendance) would otherwise consume the
 * entire budget and evict everything that actually makes the app feel quick.
 */
const MAX_ENTRY_BYTES = 250_000;

/** How long a persisted value may be replayed before it is treated as absent. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** How long to wait after a cache write before persisting, to batch a burst of them. */
const WRITE_DEBOUNCE_MS = 1_000;

type CacheValue = { data?: unknown; error?: unknown };

interface PersistedShape {
  savedAt: number;
  entries: [string, unknown][];
}

function storageKey(namespace: string): string {
  return `${PREFIX}:${namespace}`;
}

/**
 * Read back the entries stored for this account, or an empty list.
 *
 * Anything unparseable, too old, or written by an older version is dropped rather than
 * repaired: a cache is disposable by definition and a wrong entry is worse than a cold
 * start.
 */
function hydrate(namespace: string): [string, unknown][] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(storageKey(namespace));
    if (!raw) return [];

    const parsed = JSON.parse(raw) as PersistedShape;
    if (!parsed || !Array.isArray(parsed.entries) || typeof parsed.savedAt !== 'number') {
      return [];
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(storageKey(namespace));
      return [];
    }

    return parsed.entries;
  } catch {
    return [];
  }
}

/**
 * Decide whether one cache entry is worth keeping on disk.
 *
 * Only settled, successful reads are persisted. Replaying an error would show a
 * teacher a failure that already resolved, and replaying an in-flight entry would
 * restore a spinner, which is precisely the thing this module exists to remove.
 */
function isPersistable(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as CacheValue;
  return v.data !== undefined && v.error === undefined;
}

/**
 * Serialise what fits inside the budget.
 *
 * Walks newest-first so that when the budget runs out it is the stalest entries that
 * are dropped, which are also the ones least likely to be opened next.
 */
function serialise(map: Map<string, unknown>): string | null {
  const kept: [string, unknown][] = [];
  let total = 0;

  const newestFirst = Array.from(map.entries()).reverse();

  for (const [key, value] of newestFirst) {
    if (!isPersistable(value)) continue;

    let encoded: string;
    try {
      // Only `data` is carried. The rest of SWR's internal entry (isValidating,
      // isLoading, the key echo) describes a moment in time that has passed.
      encoded = JSON.stringify([key, { data: (value as CacheValue).data }]);
    } catch {
      // A value holding something JSON cannot represent, a Blob or a cycle. Skip it.
      continue;
    }

    if (encoded.length > MAX_ENTRY_BYTES) continue;
    if (total + encoded.length > MAX_TOTAL_BYTES) break;

    total += encoded.length;
    kept.push([key, { data: (value as CacheValue).data }]);
  }

  if (kept.length === 0) return null;

  try {
    return JSON.stringify({ savedAt: Date.now(), entries: kept.reverse() } satisfies PersistedShape);
  } catch {
    return null;
  }
}

/**
 * Build the Map SWR should use, pre-filled from the last visit.
 *
 * @param namespace who this cache belongs to. Entries are stored per account, so two
 *   people sharing a device (a parent and their child, two teachers on a staffroom
 *   laptop) can never read each other's. Callers pass the account id they already know
 *   synchronously; `null` means "nobody identified yet", which gets its own bucket and
 *   is discarded rather than promoted once someone signs in.
 */
export function createPersistentCache(namespace: string | null): Map<string, unknown> {
  const bucket = namespace || 'anon';
  const map = new Map<string, unknown>(hydrate(bucket) as [string, unknown][]);

  if (typeof window === 'undefined') return map;

  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      const payload = serialise(map);
      if (payload === null) {
        window.localStorage.removeItem(storageKey(bucket));
      } else {
        window.localStorage.setItem(storageKey(bucket), payload);
      }
    } catch {
      // Quota exceeded or storage blocked (private window, locked-down device). The
      // app is entirely functional without persistence, so this stays silent.
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, WRITE_DEBOUNCE_MS);
  };

  // `visibilitychange` is the one that actually fires on a phone. `beforeunload` is
  // unreliable on mobile Safari and Chrome for Android, where the tab is frozen or
  // killed without it, so it is a desktop backstop rather than the main hook.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('beforeunload', flush);

  // Wrap `set` so ordinary SWR writes keep the persisted copy current, without the
  // rest of the app knowing this Map is anything but a Map.
  const nativeSet = map.set.bind(map);
  map.set = (key: string, value: unknown) => {
    const result = nativeSet(key, value);
    if (isPersistable(value)) schedule();
    return result;
  };

  const nativeDelete = map.delete.bind(map);
  map.delete = (key: string) => {
    const result = nativeDelete(key);
    schedule();
    return result;
  };

  return map;
}

/**
 * Drop every persisted cache on this device, for every account.
 *
 * Called on sign-out and whenever the identity turns out not to be the one the cache
 * was built for. Deliberately indiscriminate: the cost of clearing too much is one
 * slow screen, and the cost of clearing too little is one person seeing another
 * person's classes.
 */
export function clearPersistentCache(): void {
  if (typeof window === 'undefined') return;

  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* nothing useful to do */
  }
}

/**
 * A tiny bounded, time-limited cache for values that are expensive to resolve and
 * cheap to hold.
 *
 * This exists because every authenticated Nexus request used to re-verify its bearer
 * token against Microsoft Graph over the network, on 346 of 423 API routes, before the
 * route did any work of its own. The same "hold it for a moment" pattern was already
 * in the codebase for app-only tokens (see graph-app-token.ts), it had just never been
 * applied to user tokens.
 *
 * Lives in module scope, so it is per warm serverless instance and disappears on a
 * cold start. That is the right shape here: it needs no infrastructure, it cannot go
 * stale across a deploy, and a cold instance simply pays the old cost once.
 *
 * Deliberately not an LRU. Entries expire on time rather than on use, because the
 * point is to bound how long a stale answer can survive, and a read should never
 * extend that window.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();

  /**
   * @param ttlMs how long a value may be served after it was stored.
   * @param maxEntries hard ceiling, so a burst of distinct keys cannot grow the
   *   process heap without limit. Oldest insertion is evicted first.
   */
  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;

    if (Date.now() >= hit.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    return hit.value;
  }

  set(key: string, value: T): void {
    // Re-inserting has to delete first: Map keeps insertion order, and the eviction
    // below relies on that order being "oldest first". Without the delete, an
    // overwritten key would keep its original position and be evicted early.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /** Drop everything. Used by tests, and available if a caller needs a hard reset. */
  clear(): void {
    this.entries.clear();
  }

  /** Live entry count, including any that have expired but not yet been read. */
  get size(): number {
    return this.entries.size;
  }
}

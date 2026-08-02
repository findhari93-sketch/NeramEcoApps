import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a stored value before the ttl elapses', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('a', 'value');

    vi.advanceTimersByTime(59_999);

    expect(cache.get('a')).toBe('value');
  });

  it('drops a value once the ttl has elapsed', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('a', 'value');

    vi.advanceTimersByTime(60_000);

    expect(cache.get('a')).toBeUndefined();
  });

  it('reclaims the slot of an expired entry it reads', () => {
    const cache = new TtlCache<string>(1_000);
    cache.set('a', 'value');
    vi.advanceTimersByTime(1_000);

    cache.get('a');

    expect(cache.size).toBe(0);
  });

  it('returns undefined for a key it has never seen', () => {
    const cache = new TtlCache<string>(60_000);

    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts the oldest insertion once maxEntries is exceeded', () => {
    const cache = new TtlCache<string>(60_000, 2);

    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
    expect(cache.size).toBe(2);
  });

  it('treats an overwrite as the newest entry, not the original position', () => {
    // Without the delete-before-set in `set`, 'a' would keep its original slot and be
    // evicted here even though it was just written.
    const cache = new TtlCache<string>(60_000, 2);

    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('a', 'refreshed');
    cache.set('c', '3');

    expect(cache.get('a')).toBe('refreshed');
    expect(cache.get('b')).toBeUndefined();
  });

  it('restarts the ttl when a key is overwritten', () => {
    const cache = new TtlCache<string>(1_000);
    cache.set('a', 'first');

    vi.advanceTimersByTime(900);
    cache.set('a', 'second');
    vi.advanceTimersByTime(900);

    expect(cache.get('a')).toBe('second');
  });

  it('forgets a deleted key', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('a', 'value');

    cache.delete('a');

    expect(cache.get('a')).toBeUndefined();
  });

  it('empties on clear', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('a', '1');
    cache.set('b', '2');

    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});

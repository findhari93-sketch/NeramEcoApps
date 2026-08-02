import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPersistentCache, clearPersistentCache } from './swr-cache';

const PREFIX = 'nexus_swr_cache_v1';

/** SWR stores entries in this shape; only settled successes should be persisted. */
const ok = (data: unknown) => ({ data, isValidating: false, isLoading: false });
const failed = (error: unknown) => ({ error, isValidating: false, isLoading: false });

/** Force the debounced write to land, the way hiding the tab does on a phone. */
function hideTab() {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('persistent SWR cache', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty when nothing was stored', () => {
    const cache = createPersistentCache('oid-1');

    expect(cache.size).toBe(0);
  });

  it('replays a successful read on the next visit', () => {
    const first = createPersistentCache('oid-1');
    first.set('/api/catchup/overview', ok({ totals: { outstanding: 3 } }));
    hideTab();

    const second = createPersistentCache('oid-1');

    expect((second.get('/api/catchup/overview') as any).data).toEqual({
      totals: { outstanding: 3 },
    });
  });

  it('is warm on the very first frame, with no await', () => {
    const first = createPersistentCache('oid-1');
    first.set('/api/timetable', ok([{ id: 'class-1' }]));
    hideTab();

    // The point of localStorage over IndexedDB: this is synchronous.
    const second = createPersistentCache('oid-1');

    expect(second.size).toBe(1);
  });

  it('never replays a failure, so a resolved outage does not persist on screen', () => {
    const first = createPersistentCache('oid-1');
    first.set('/api/timetable', failed(new Error('500')));
    hideTab();

    const second = createPersistentCache('oid-1');

    expect(second.size).toBe(0);
  });

  it('keeps one account out of another account cache', () => {
    const teacher = createPersistentCache('oid-teacher');
    teacher.set('/api/students', ok([{ name: 'A Student' }]));
    hideTab();

    const parent = createPersistentCache('oid-parent');

    expect(parent.size).toBe(0);
  });

  it('gives an unidentified visitor their own bucket', () => {
    const anon = createPersistentCache(null);
    anon.set('/api/nav-badges', ok({ count: 1 }));
    hideTab();

    expect(createPersistentCache('oid-1').size).toBe(0);
    expect(createPersistentCache(null).size).toBe(1);
  });

  it('drops everything for every account on clear', () => {
    const teacher = createPersistentCache('oid-teacher');
    teacher.set('/api/students', ok([1]));
    hideTab();
    const student = createPersistentCache('oid-student');
    student.set('/api/assignments', ok([2]));
    hideTab();

    clearPersistentCache();

    expect(createPersistentCache('oid-teacher').size).toBe(0);
    expect(createPersistentCache('oid-student').size).toBe(0);
  });

  it('leaves unrelated localStorage keys alone when clearing', () => {
    localStorage.setItem('nexus_active_classroom_id', 'c-1');
    const cache = createPersistentCache('oid-1');
    cache.set('/api/timetable', ok([1]));
    hideTab();

    clearPersistentCache();

    expect(localStorage.getItem('nexus_active_classroom_id')).toBe('c-1');
  });

  it('refuses to store a single oversized response', () => {
    const cache = createPersistentCache('oid-1');
    cache.set('/api/question-bank', ok({ blob: 'x'.repeat(300_000) }));
    hideTab();

    expect(createPersistentCache('oid-1').size).toBe(0);
  });

  it('still stores normal responses alongside an oversized one', () => {
    const cache = createPersistentCache('oid-1');
    cache.set('/api/question-bank', ok({ blob: 'x'.repeat(300_000) }));
    cache.set('/api/nav-badges', ok({ count: 2 }));
    hideTab();

    const next = createPersistentCache('oid-1');

    expect(next.has('/api/nav-badges')).toBe(true);
    expect(next.has('/api/question-bank')).toBe(false);
  });

  it('ignores an entry written more than a day ago', () => {
    const cache = createPersistentCache('oid-1');
    cache.set('/api/timetable', ok([1]));
    hideTab();

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 1);

    expect(createPersistentCache('oid-1').size).toBe(0);
  });

  it('survives a corrupt stored value rather than throwing on boot', () => {
    localStorage.setItem(`${PREFIX}:oid-1`, '{{not json');

    expect(() => createPersistentCache('oid-1')).not.toThrow();
    expect(createPersistentCache('oid-1').size).toBe(0);
  });

  it('drops a value that cannot be serialised without losing the rest', () => {
    const cache = createPersistentCache('oid-1');
    const cyclic: any = {};
    cyclic.self = cyclic;
    cache.set('/api/cyclic', ok(cyclic));
    cache.set('/api/fine', ok({ ok: true }));
    hideTab();

    const next = createPersistentCache('oid-1');

    expect(next.has('/api/fine')).toBe(true);
    expect(next.has('/api/cyclic')).toBe(false);
  });

  it('forgets a deleted key on the next visit', () => {
    const cache = createPersistentCache('oid-1');
    cache.set('/api/timetable', ok([1]));
    cache.set('/api/students', ok([2]));
    hideTab();

    const second = createPersistentCache('oid-1');
    second.delete('/api/timetable');
    hideTab();

    const third = createPersistentCache('oid-1');
    expect(third.has('/api/timetable')).toBe(false);
    expect(third.has('/api/students')).toBe(true);
  });

  it('behaves as an ordinary Map for the code that consumes it', () => {
    const cache = createPersistentCache('oid-1');
    cache.set('k', ok(1));

    expect(cache.get('k')).toEqual(ok(1));
    expect(cache.has('k')).toBe(true);
    expect(Array.from(cache.keys())).toEqual(['k']);
    cache.delete('k');
    expect(cache.has('k')).toBe(false);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPersistentCache, clearPersistentCache } from './swr-cache';

const PREFIX = 'nexus_swr_cache_v1';

/** What buildStamp() falls back to when nothing set NEXT_PUBLIC_BUILD_STAMP, as here. */
const DEV_BUILD = 'dev';

/** A bucket belongs to one build and one account, in that order. */
const keyFor = (namespace: string, build = DEV_BUILD) => `${PREFIX}:${build}:${namespace}`;

/** Pretend the bundle running right now came out of a particular build. */
function buildAs(stamp: string) {
  process.env.NEXT_PUBLIC_BUILD_STAMP = stamp;
}

function storedKeys(): string[] {
  return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(
    (k): k is string => k !== null,
  );
}

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
    delete process.env.NEXT_PUBLIC_BUILD_STAMP;
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
    localStorage.setItem(keyFor('oid-1'), '{{not json');

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

  /**
   * The shape of every entry in here belongs to the deploy that wrote it, and this
   * cache replays for a day. So a deploy that changes any payload hands the new
   * components an older program's data on their very first frame.
   *
   * That is not a theoretical concern, it is the crash: /api/catchup/overview
   * started returning `totals.byBucket` in the same deploy whose tiles read
   * `totals.byBucket.run_over`, and a teacher who had opened that screen the day
   * before got `undefined.run_over` during render. No error boundary covers the
   * teacher segment, so the whole app was replaced by the crash page, and reloading
   * replayed the same entry into the same crash.
   */
  describe('across deploys', () => {
    it('replays what the same build wrote', () => {
      buildAs('build-a');
      const first = createPersistentCache('oid-1');
      first.set('/api/catchup/overview', ok({ totals: { byBucket: { run_over: 3 } } }));
      hideTab();

      const second = createPersistentCache('oid-1');

      expect((second.get('/api/catchup/overview') as any).data).toEqual({
        totals: { byBucket: { run_over: 3 } },
      });
    });

    it('ignores what an earlier build wrote', () => {
      buildAs('build-a');
      const before = createPersistentCache('oid-1');
      before.set('/api/catchup/overview', ok({ totals: { studentsBehind: 4 } }));
      hideTab();

      buildAs('build-b');

      expect(createPersistentCache('oid-1').size).toBe(0);
    });

    it('leaves nothing on the device from a build it will never read', () => {
      buildAs('build-a');
      const before = createPersistentCache('oid-1');
      before.set('/api/catchup/overview', ok({ ok: true }));
      hideTab();
      expect(storedKeys()).toContain(keyFor('oid-1', 'build-a'));

      buildAs('build-b');
      createPersistentCache('oid-1');

      // Otherwise one bucket per deploy accumulates against a 5MB origin quota, and
      // the first thing squeezed out is the auth cache the app boots from.
      expect(storedKeys()).not.toContain(keyFor('oid-1', 'build-a'));
    });

    it('keeps a second account on the same build', () => {
      buildAs('build-a');
      const mine = createPersistentCache('oid-teacher');
      mine.set('/api/students', ok([1]));
      hideTab();

      // A staffroom laptop: two live buckets on one build, neither of them stale.
      const theirs = createPersistentCache('oid-parent');
      theirs.set('/api/students', ok([2]));
      hideTab();

      expect(createPersistentCache('oid-teacher').has('/api/students')).toBe(true);
      expect(createPersistentCache('oid-parent').has('/api/students')).toBe(true);
    });
  });
});

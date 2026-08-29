import { describe, expect, it } from 'vitest';
import { resolveTestRunWindow } from './test-access';

/**
 * Whether a student may sit a run right now.
 *
 * The ordering here is load-bearing, and it is the same trap the exam makeup
 * branch of api/tests/attempt documents: a student who has been granted a
 * window is sitting a DIFFERENT window from the shared one. Check the shared
 * close time first and you refuse every reopened student before their grant is
 * ever read, which looks exactly like "the reopen feature does nothing".
 */

const NOW = Date.parse('2026-08-20T10:00:00Z');
const YESTERDAY = '2026-08-19T10:00:00Z';
const TOMORROW = '2026-08-21T10:00:00Z';
const LAST_WEEK = '2026-08-13T10:00:00Z';

const base = { opensAt: null as string | null, closesAt: null as string | null, grant: null as any, now: NOW };

describe('resolveTestRunWindow', () => {
  it('is open when the run has no window at all, which is every run made before this feature', () => {
    expect(resolveTestRunWindow(base).open).toBe(true);
  });

  it('is open inside the shared window', () => {
    expect(resolveTestRunWindow({ ...base, closesAt: TOMORROW }).open).toBe(true);
  });

  it('is shut once the due date has passed', () => {
    const r = resolveTestRunWindow({ ...base, closesAt: YESTERDAY });
    expect(r.open).toBe(false);
    expect(r.reason).toBe('closed');
  });

  it('is shut before it opens, and says so differently from having closed', () => {
    const r = resolveTestRunWindow({ ...base, opensAt: TOMORROW });
    expect(r.open).toBe(false);
    expect(r.reason).toBe('not_yet');
  });

  /** The whole point of the reopen flow. */
  it('lets a granted student in after the shared window has shut', () => {
    const r = resolveTestRunWindow({
      ...base,
      closesAt: YESTERDAY,
      grant: { opens_at: YESTERDAY, closes_at: TOMORROW },
    });
    expect(r.open).toBe(true);
    expect(r.via_grant).toBe(true);
    expect(r.window_open_until).toBe(TOMORROW);
  });

  it('lets a granted student in even when their grant has no end date', () => {
    const r = resolveTestRunWindow({
      ...base,
      closesAt: YESTERDAY,
      grant: { opens_at: null, closes_at: null },
    });
    expect(r.open).toBe(true);
    expect(r.via_grant).toBe(true);
  });

  /**
   * An expired grant must not fall through to the shared window and report a
   * plain "closed". The student had an extension and it ran out, which is a
   * different thing to tell them than "you never had one".
   */
  it('says the extension ran out rather than that the test simply closed', () => {
    const r = resolveTestRunWindow({
      ...base,
      closesAt: LAST_WEEK,
      grant: { opens_at: LAST_WEEK, closes_at: YESTERDAY },
    });
    expect(r.open).toBe(false);
    expect(r.reason).toBe('grant_expired');
    expect(r.window_open_until).toBe(YESTERDAY);
  });

  it('holds a grant that has not started yet without letting them in early', () => {
    const r = resolveTestRunWindow({
      ...base,
      closesAt: YESTERDAY,
      grant: { opens_at: TOMORROW, closes_at: null },
    });
    expect(r.open).toBe(false);
  });

  /**
   * A grant issued while the run is still open is harmless: the student was
   * already allowed in, and the grant simply outlives the shared close.
   */
  it('does not shut a student out because they hold a grant while the run is still open', () => {
    const r = resolveTestRunWindow({
      ...base,
      closesAt: TOMORROW,
      grant: { opens_at: YESTERDAY, closes_at: '2026-08-30T10:00:00Z' },
    });
    expect(r.open).toBe(true);
  });

  it('ignores an unparseable date rather than locking everyone out of the run', () => {
    const r = resolveTestRunWindow({ ...base, closesAt: 'not a date' });
    expect(r.open).toBe(true);
  });
});

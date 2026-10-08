// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fakeDb } from './testing/fake-db';
import { TEST_LOCK_EXEMPT_KEY, hasTestRunning } from './test-lock';

const NOW = new Date('2026-10-06T05:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const attempt = (over: Record<string, unknown>) => ({ id: 'a1', student_id: 's1', test_id: 't1', status: 'in_progress', started_at: ago(10), ...over });

function db(tables: Record<string, any[]>) {
  return fakeDb({ nexus_settings: [], nexus_tests: [{ id: 't1', duration_minutes: 60 }, { id: 't2', duration_minutes: null }], nexus_test_attempts: [], ...tables });
}

describe('hasTestRunning', () => {
  it('locks while a timed test is within its time plus grace', async () => {
    expect(await hasTestRunning(db({ nexus_test_attempts: [attempt({ started_at: ago(70) })] }), 's1', NOW)).toBe(true);
  });

  it('frees once the time and grace have run out', async () => {
    expect(await hasTestRunning(db({ nexus_test_attempts: [attempt({ started_at: ago(80) })] }), 's1', NOW)).toBe(false);
  });

  it('gives an untimed test three hours', async () => {
    expect(await hasTestRunning(db({ nexus_test_attempts: [attempt({ test_id: 't2', started_at: ago(170) })] }), 's1', NOW)).toBe(true);
    expect(await hasTestRunning(db({ nexus_test_attempts: [attempt({ test_id: 't2', started_at: ago(190) })] }), 's1', NOW)).toBe(false);
  });

  it('ignores attempts abandoned weeks ago, submitted ones and other students', async () => {
    const rows = [
      attempt({ id: 'old', started_at: '2026-08-26T17:41:04.293+00:00' }),
      attempt({ id: 'done', status: 'submitted' }),
      attempt({ id: 'other', student_id: 's2' }),
    ];
    expect(await hasTestRunning(db({ nexus_test_attempts: rows }), 's1', NOW)).toBe(false);
  });

  it('skips the lock for an exempt account', async () => {
    const tables = { nexus_test_attempts: [attempt({})], nexus_settings: [{ key: TEST_LOCK_EXEMPT_KEY, value: ['s1'] }] };
    expect(await hasTestRunning(db(tables), 's1', NOW)).toBe(false);
    expect(await hasTestRunning(db({ ...tables, nexus_test_attempts: [attempt({ student_id: 's2' })] }), 's2', NOW)).toBe(true);
  });

  it('fails closed when the attempts read errors', async () => {
    const real = db({});
    const supabase = {
      from: (n: string) =>
        n === 'nexus_test_attempts'
          ? { select: () => { const q: any = { eq: () => q, gte: () => q, then: (r: any) => r({ data: null, error: { message: 'down' } }) }; return q; } }
          : real.from(n),
    };
    expect(await hasTestRunning(supabase, 's1', NOW)).toBe(true);
  });
});

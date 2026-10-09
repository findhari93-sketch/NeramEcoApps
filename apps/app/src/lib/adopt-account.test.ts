// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isDisposableAccount } from './adopt-account';

/** A client whose head counts come from `counts[table]`. */
function client(counts: Record<string, number>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({ count: counts[table] ?? 0, error: null }),
      }),
    }),
  } as any;
}

const NOW = Date.parse('2026-10-08T12:00:00Z');
const fresh = { id: 'u-google', user_type: 'lead', created_at: '2026-10-08T11:55:00Z' };

describe('isDisposableAccount', () => {
  it('a lead made minutes ago with nothing in it may be merged', async () => {
    expect(await isDisposableAccount(client({}), fresh, NOW)).toBe(true);
  });

  it('never an account with an application or a payment', async () => {
    expect(await isDisposableAccount(client({ lead_profiles: 1 }), fresh, NOW)).toBe(false);
    expect(await isDisposableAccount(client({ payments: 1 }), fresh, NOW)).toBe(false);
  });

  it('never an account older than a day, or a student or staff account', async () => {
    expect(await isDisposableAccount(client({}), { ...fresh, created_at: '2026-10-06T12:00:00Z' }, NOW)).toBe(false);
    expect(await isDisposableAccount(client({}), { ...fresh, user_type: 'student' }, NOW)).toBe(false);
    expect(await isDisposableAccount(client({}), { ...fresh, created_at: null }, NOW)).toBe(false);
  });
});

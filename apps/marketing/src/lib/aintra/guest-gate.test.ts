import { describe, it, expect, vi } from 'vitest';
import { guestNeedsSignIn, needsSignIn, startOfIstDay } from './guest-gate';

describe('startOfIstDay', () => {
  it('is 18:30 UTC the day before', () => {
    expect(startOfIstDay(new Date('2026-10-17T05:00:00Z')).toISOString()).toBe('2026-10-16T18:30:00.000Z');
  });

  it('rolls over at India midnight, not UTC midnight', () => {
    // 23:59 IST on 16 Oct, then 00:01 IST on 17 Oct.
    expect(startOfIstDay(new Date('2026-10-16T18:29:00Z')).toISOString()).toBe('2026-10-15T18:30:00.000Z');
    expect(startOfIstDay(new Date('2026-10-16T18:31:00Z')).toISOString()).toBe('2026-10-16T18:30:00.000Z');
  });
});

describe('needsSignIn', () => {
  const now = new Date('2026-10-17T05:00:00Z'); // 10:30 am IST, 17 Oct

  it('first day is free, a later day is not', () => {
    expect(needsSignIn({ firstChatAt: '2026-10-17T01:00:00Z', now })).toBe(false); // 6:30 am IST today
    expect(needsSignIn({ firstChatAt: '2026-10-16T18:40:00Z', now })).toBe(false); // 00:10 IST today
    expect(needsSignIn({ firstChatAt: '2026-10-16T18:20:00Z', now })).toBe(true); // 23:50 IST yesterday
    expect(needsSignIn({ firstChatAt: '2026-09-01T10:00:00Z', now })).toBe(true);
  });

  it('a guest with no earlier chat, or a bad date, is let through', () => {
    expect(needsSignIn({ firstChatAt: null, now })).toBe(false);
    expect(needsSignIn({ firstChatAt: 'not a date', now })).toBe(false);
  });
});

/** A tiny stand-in for the Supabase query builder. */
function fakeDb(result: { data?: unknown; error?: unknown } | Error) {
  const calls: Record<string, unknown[]> = {};
  const chain: any = {
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn((...a: unknown[]) => ((calls.eq = a), chain)),
    lt: vi.fn((...a: unknown[]) => ((calls.lt = a), chain)),
    limit: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
  return { db: chain, calls };
}

describe('guestNeedsSignIn', () => {
  const now = new Date('2026-10-17T05:00:00Z');

  it('looks up chats by this visitor from before today', async () => {
    const { db, calls } = fakeDb({ data: [{ created_at: '2026-10-15T10:00:00Z' }], error: null });
    expect(await guestNeedsSignIn(db, 'anon_1', now)).toBe(true);
    expect(calls.eq).toEqual(['anonymous_id', 'anon_1']);
    expect(calls.lt).toEqual(['created_at', '2026-10-16T18:30:00.000Z']);
  });

  it('nothing earlier means free', async () => {
    const { db } = fakeDb({ data: [], error: null });
    expect(await guestNeedsSignIn(db, 'anon_1', now)).toBe(false);
  });

  it('fails open on an error, a throw, or no visitor id', async () => {
    expect(await guestNeedsSignIn(fakeDb({ data: null, error: { message: 'down' } }).db, 'anon_1', now)).toBe(false);
    expect(await guestNeedsSignIn(fakeDb(new Error('network')).db, 'anon_1', now)).toBe(false);
    expect(await guestNeedsSignIn(fakeDb({ data: [{ created_at: '2026-01-01T00:00:00Z' }] }).db, null, now)).toBe(false);
  });
});

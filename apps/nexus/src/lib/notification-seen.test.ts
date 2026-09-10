import { describe, it, expect } from 'vitest';
import { pickSeenNotifications, SEEN_DWELL_MS } from './notification-seen';

describe('pickSeenNotifications', () => {
  const list = [
    { id: 'n1', is_read: true },
    { id: 'n2', is_read: false },
    { id: 'n3', is_read: true },
    { id: 'n4', is_read: false },
  ];

  it('picks only the unread rows', () => {
    expect(pickSeenNotifications(list, new Set())).toEqual(['n2', 'n4']);
  });

  /** Without this, closing and re-opening the bell re-POSTs every row: the
   *  optimistic is_read flip can be overwritten by a fetch that raced it. */
  it('never picks a row it has already swept', () => {
    expect(pickSeenNotifications(list, new Set(['n2']))).toEqual(['n4']);
  });

  it('returns nothing for an all-read panel', () => {
    expect(pickSeenNotifications([{ id: 'a', is_read: true }], new Set())).toEqual([]);
  });

  it('returns nothing for an empty panel', () => {
    expect(pickSeenNotifications([], new Set())).toEqual([]);
  });
});

describe('SEEN_DWELL_MS', () => {
  it('is long enough to be a look, short enough to feel automatic', () => {
    expect(SEEN_DWELL_MS).toBeGreaterThanOrEqual(1000);
    expect(SEEN_DWELL_MS).toBeLessThanOrEqual(3000);
  });
});

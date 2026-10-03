// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  BADGE_KEYS,
  ZERO_BADGES,
  badgeWindow,
  normalizeBadgeCounts,
  shouldRefreshBadges,
  BADGE_POLL_MS,
  BADGE_MIN_GAP_MS,
} from './admin-badges';

describe('normalizeBadgeCounts', () => {
  it('maps every key from the RPC payload and coerces strings to numbers', () => {
    const out = normalizeBadgeCounts({
      leads: 3,
      students: '7',
      careers: 2,
      messages_unread: 5,
      notifications_unread: 11,
      lifecycle: 29,
    });
    expect(out.leads).toBe(3);
    expect(out.students).toBe(7);
    expect(out.careers).toBe(2);
    expect(out.messages_unread).toBe(5);
    expect(out.notifications_unread).toBe(11);
    expect(out.lifecycle).toBe(29);
    // Missing keys default to 0, never undefined.
    expect(out.payments).toBe(0);
    expect(Object.keys(out).sort()).toEqual([...BADGE_KEYS].sort());
  });

  it('treats null, garbage and negatives as zero', () => {
    expect(normalizeBadgeCounts(null)).toEqual(ZERO_BADGES);
    expect(normalizeBadgeCounts('x' as unknown)).toEqual(ZERO_BADGES);
    const out = normalizeBadgeCounts({ leads: 'abc', students: -4, payments: null });
    expect(out.leads).toBe(0);
    expect(out.students).toBe(0);
    expect(out.payments).toBe(0);
  });

  it('ignores unknown keys', () => {
    const out = normalizeBadgeCounts({ leads: 1, evil: 99 }) as Record<string, number>;
    expect(out.evil).toBeUndefined();
  });
});

describe('badgeWindow', () => {
  it('uses the last 24 hours for chats and the end of today in India for follow-ups', () => {
    // 2026-10-01 20:00 UTC is already 2 Oct 01:30 in India, so "end of today"
    // is the end of 2 Oct IST = 2026-10-02T18:30:00Z.
    const w = badgeWindow(new Date('2026-10-01T20:00:00Z'));
    expect(w.chatSince).toBe('2026-09-30T20:00:00.000Z');
    expect(w.followUpBefore).toBe('2026-10-02T18:30:00.000Z');
  });
});

describe('shouldRefreshBadges', () => {
  it('polls every two minutes', () => {
    expect(BADGE_POLL_MS).toBe(120_000);
  });

  it('refreshes on focus or navigation only when the last fetch is older than the minimum gap', () => {
    const now = 1_000_000;
    expect(shouldRefreshBadges(null, now)).toBe(true);
    expect(shouldRefreshBadges(now - BADGE_MIN_GAP_MS + 1, now)).toBe(false);
    expect(shouldRefreshBadges(now - BADGE_MIN_GAP_MS, now)).toBe(true);
  });
});

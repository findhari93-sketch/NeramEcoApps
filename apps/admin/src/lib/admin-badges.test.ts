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
  collectionsBadgeCount,
  istTodayKey,
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

describe('collections badge', () => {
  it('is a sidebar badge key that defaults to zero', () => {
    expect(BADGE_KEYS).toContain('collections');
    expect(ZERO_BADGES.collections).toBe(0);
    expect(normalizeBadgeCounts({ collections: '4' }).collections).toBe(4);
  });

  it('adds open fee reports and installments due today or earlier', () => {
    expect(collectionsBadgeCount(2, 3)).toBe(5);
    expect(collectionsBadgeCount(0, 0)).toBe(0);
  });

  it('treats a failed count (null) or garbage as zero instead of hiding the other', () => {
    expect(collectionsBadgeCount(null, 3)).toBe(3);
    expect(collectionsBadgeCount(2, undefined)).toBe(2);
    expect(collectionsBadgeCount(-1, Number.NaN)).toBe(0);
  });

  it('adds balance payments waiting to be verified', () => {
    expect(collectionsBadgeCount(1, 2, 3)).toBe(6);
    expect(collectionsBadgeCount(0, 0, 4)).toBe(4);
    expect(collectionsBadgeCount(2, 3, null)).toBe(5);
  });

  it('uses the India date for "due today", so 11pm IST is still the same day', () => {
    // 2026-10-16 17:30 UTC is 23:00 on 16 Oct in India.
    expect(istTodayKey(new Date('2026-10-16T17:30:00Z'))).toBe('2026-10-16');
    // 2026-10-16 18:30 UTC is midnight, 17 Oct in India.
    expect(istTodayKey(new Date('2026-10-16T18:30:00Z'))).toBe('2026-10-17');
  });
});

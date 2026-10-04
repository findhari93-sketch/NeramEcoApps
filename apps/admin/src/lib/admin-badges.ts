/**
 * Sidebar badges and the notification bell, as one payload.
 *
 * Before: the sidebar polled three routes every minute (/api/messages/unread-count,
 * /api/careers/applications/count, /api/admin-badges) and the bell polled a fourth
 * (/api/notifications?isRead=false). The bell is mounted twice (sidebar header and
 * the mobile top bar), so a single open tab cost five function invocations and 13+
 * count queries a minute. Now /api/admin-badges answers all of them from one SQL
 * function (admin_badge_counts) and one shared poller asks every two minutes, plus
 * on window focus and on navigation.
 *
 * Pure helpers only, so the rules are unit-tested without a browser or a database.
 */

export const BADGE_KEYS = [
  'leads',
  'students',
  'demo_classes',
  'support_tickets',
  'app_feedback',
  'qa_moderation',
  'payments',
  'chat_history',
  'duplicates',
  'follow_ups',
  'lifecycle',
  'careers',
  'messages_unread',
  'notifications_unread',
] as const;

export type BadgeKey = (typeof BADGE_KEYS)[number];
export type BadgeCounts = Record<BadgeKey, number>;

export const ZERO_BADGES: BadgeCounts = Object.freeze(
  Object.fromEntries(BADGE_KEYS.map((k) => [k, 0])) as BadgeCounts,
) as BadgeCounts;

/** How often the shared poller asks, while the tab is visible. */
export const BADGE_POLL_MS = 120_000;

/**
 * Focus and navigation also refresh, but not more often than this. Clicking
 * through five menu items in ten seconds should cost one request, not five.
 */
export const BADGE_MIN_GAP_MS = 15_000;

/** Coerce whatever the RPC (or the legacy fallback) returned into a full, safe count map. */
export function normalizeBadgeCounts(raw: unknown): BadgeCounts {
  const out = { ...ZERO_BADGES };
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const key of BADGE_KEYS) {
    const n = Number(src[key]);
    out[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return out;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The time windows the counts use: chats from the last 24 hours, and follow-ups
 * due before the end of today in India (the same rule as countDueFollowUps).
 */
export function badgeWindow(now: Date = new Date()): { chatSince: string; followUpBefore: string } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const startOfTodayIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
  return {
    chatSince: new Date(now.getTime() - DAY_MS).toISOString(),
    followUpBefore: new Date(startOfTodayIst + DAY_MS).toISOString(),
  };
}

/** Whether a focus / navigation trigger should fetch, given when the last fetch ran. */
export function shouldRefreshBadges(lastFetchedAt: number | null, now: number = Date.now()): boolean {
  if (lastFetchedAt === null) return true;
  return now - lastFetchedAt >= BADGE_MIN_GAP_MS;
}

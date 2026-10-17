/**
 * Turns chatbot_conversations rows into Aintra Inbox conversations and people.
 * Pure: the API route loads the rows and the user facts, this shapes them, and
 * it is unit tested without a database.
 */
import { formatSignupPlace } from '@neram/database/signup-geo';
import { intentsOf, intentsOfMany, type Intent } from './intents';
import { isRecent, leadStage } from './stage';
import { inReviewQueue, isCreditsError, isSignupGate, turnStatus, worstStatus } from './status';
import type {
  DayBucket,
  InboxConversation,
  InboxPerson,
  InboxRow,
  InboxTurn,
  InboxUser,
  Nudge,
  TurnStatus,
} from './types';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-10-15" for an instant, in India time. */
export function istDay(iso: string | Date): string {
  const t = (typeof iso === 'string' ? new Date(iso) : iso).getTime() + IST_OFFSET_MS;
  return new Date(t).toISOString().slice(0, 10);
}

function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

/** Today, Yesterday, This week, then one bucket per month ("2026-09"). */
export function dayBucket(iso: string, now: Date): DayBucket {
  const diff = dayNumber(istDay(now)) - dayNumber(istDay(iso));
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return 'week';
  return istDay(iso).slice(0, 7);
}

/** "#4A1F": the last four hex characters of the visitor id, or a hash of the session for older chats. */
export function guestTag(anonymousId: string | null, sessionId: string): string {
  const hex = (anonymousId ?? '').replace(/[^0-9a-f]/gi, '');
  if (hex.length >= 4) return `#${hex.slice(-4).toUpperCase()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < sessionId.length; i++) {
    h ^= sessionId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `#${((h >>> 0) & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;
}

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/**
 * Who a chat belongs to. A guest chat whose visitor id later created an account
 * (users.anonymous_id) belongs to that account, so their chats from before and
 * after signing up show as one person.
 */
export function personKeyOf(
  row: Pick<InboxRow, 'user_id' | 'anonymous_id' | 'session_id'>,
  accountByAnon?: Map<string, string>
): string {
  if (row.user_id) return `u:${row.user_id}`;
  if (row.anonymous_id) {
    const owner = accountByAnon?.get(row.anonymous_id);
    return owner ? `u:${owner}` : `a:${row.anonymous_id}`;
  }
  return `s:${row.session_id}`;
}

const latest = <T>(rows: T[], pick: (r: T) => string | null | undefined): string | null => {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = pick(rows[i]);
    if (v) return v;
  }
  return null;
};

function placeOf(rows: InboxRow[]): { place: string | null; stateName: string | null } {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    const place = formatSignupPlace({ city: r.geo_city, state: r.geo_state, country: r.geo_country });
    if (place) return { place, stateName: r.geo_state || null };
  }
  return { place: null, stateName: null };
}

function statusOf(r: InboxRow): TurnStatus {
  return turnStatus(r);
}

/** One conversation per chat session. Rows may arrive in any order. */
export function buildConversations(
  rows: InboxRow[],
  users: Map<string, InboxUser>,
  now: Date
): InboxConversation[] {
  const bySession = new Map<string, InboxRow[]>();
  for (const r of rows) {
    const list = bySession.get(r.session_id);
    if (list) list.push(r);
    else bySession.set(r.session_id, [r]);
  }

  const accountByAnon = new Map<string, string>();
  for (const u of users.values()) if (u.anonymousId) accountByAnon.set(u.anonymousId, u.id);

  const out: InboxConversation[] = [];
  for (const [sessionId, list] of bySession) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const userId = latest(list, (r) => r.user_id);
    const anonymousId = latest(list, (r) => r.anonymous_id);
    const user = userId ? users.get(userId) ?? null : null;
    const statuses = list.map(statusOf);
    const questions = list.map((r) => r.user_message);
    const name = userId ? user?.name || latest(list, (r) => r.lead_name) || 'Signed-in user' : 'Guest';
    const tag = userId ? null : guestTag(anonymousId, sessionId);
    const last = list[list.length - 1];
    const { place, stateName } = placeOf(list);
    out.push({
      id: sessionId,
      personKey: personKeyOf({ user_id: userId, anonymous_id: anonymousId, session_id: sessionId }, accountByAnon),
      userId,
      anonymousId,
      isGuest: !userId,
      name,
      guestTag: tag,
      initials: userId ? initialsOf(name) : '',
      avatarUrl: user?.avatarUrl ?? null,
      enrolled: !!user?.enrolled,
      phone: userId ? user?.phone || latest(list, (r) => r.lead_phone) : null,
      startedAt: list[0].created_at,
      lastAt: last.created_at,
      bucket: dayBucket(last.created_at, now),
      place,
      stateName,
      channel: latest(list, (r) => r.channel) ?? (user?.firstChannel || null),
      device: latest(list, (r) => r.device),
      source: last.source,
      questions,
      turnStatuses: statuses,
      lastQuestion: last.user_message,
      turnCount: list.length,
      intents: intentsOfMany(questions),
      status: worstStatus(statuses),
      reviewCount: statuses.filter((s) => s === 'review').length,
      errorCount: statuses.filter((s) => s === 'error').length,
      creditErrorCount: list.filter((r, i) => statuses[i] === 'error' && isCreditsError(r.error)).length,
      queueAt: list.filter((_, i) => inReviewQueue(statuses[i])).map((r) => r.created_at),
      gatedAt: latest(list, (r) => (isSignupGate(r.error) ? r.created_at : null)),
    });
  }
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** One row per person, newest activity first. */
export function buildPeople(
  conversations: InboxConversation[],
  users: Map<string, InboxUser>,
  nudges: Map<string, Nudge>,
  now: Date
): InboxPerson[] {
  const byPerson = new Map<string, InboxConversation[]>();
  for (const c of conversations) {
    const list = byPerson.get(c.personKey);
    if (list) list.push(c);
    else byPerson.set(c.personKey, [c]);
  }

  const out: InboxPerson[] = [];
  for (const [key, list] of byPerson) {
    // conversations arrive newest first
    const newest = list[0];
    const oldest = list[list.length - 1];
    // A person with an account is named after it, even when their newest chat was before signing in.
    const owner = list.find((c) => c.userId) ?? newest;
    const user = owner.userId ? users.get(owner.userId) ?? null : null;
    const allQuestions = list.flatMap((c) => c.questions);
    const recentQuestions = list.filter((c) => isRecent(c.lastAt, now)).flatMap((c) => c.questions);
    const allIntents: Intent[] = intentsOfMany(allQuestions);
    const recentIntents: Intent[] = [...new Set(recentQuestions.flatMap((q) => intentsOf(q)))];
    out.push({
      key,
      userId: owner.userId,
      anonymousId: newest.anonymousId,
      isGuest: owner.isGuest,
      name: owner.name,
      guestTag: owner.guestTag,
      initials: owner.initials,
      phone: owner.phone,
      email: user?.email ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      enrolled: !!user?.enrolled,
      profileLabel: user?.profileLabel ?? null,
      joinedAt: user?.joinedAt ?? null,
      place: list.find((c) => c.place)?.place ?? null,
      channel: user?.firstChannel || list.find((c) => c.channel)?.channel || null,
      device: list.find((c) => c.device)?.device ?? null,
      visits: list.length,
      firstSeen: oldest.startedAt,
      lastAt: newest.lastAt,
      lastQuestion: newest.lastQuestion,
      lastConversationId: newest.id,
      intents: allIntents,
      stage: leadStage({ user, recentIntents, allIntents }),
      nudge: newest.anonymousId ? nudges.get(newest.anonymousId) ?? null : null,
      gatedAt: list.reduce<string | null>((max, c) => (c.gatedAt && (!max || c.gatedAt > max) ? c.gatedAt : max), null),
    });
  }
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** A turn's status again after staff changed it in the transcript. */
export function restatus(t: InboxTurn): InboxTurn {
  return {
    ...t,
    status: turnStatus({
      error: t.error,
      thumbs_up: t.thumbsUp,
      has_correction: !!t.correction?.trim(),
      ai_verdict: t.aiReview?.verdict ?? null,
      resolved: !!t.resolvedAt,
    }),
  };
}

/** The list row for a conversation, brought in line with its loaded turns. */
export function withTurns(c: InboxConversation, turns: InboxTurn[]): InboxConversation {
  const statuses = turns.map((t) => t.status);
  return {
    ...c,
    turnStatuses: statuses,
    status: worstStatus(statuses),
    reviewCount: statuses.filter((s) => s === 'review').length,
    errorCount: statuses.filter((s) => s === 'error').length,
    creditErrorCount: turns.filter((t) => t.status === 'error' && isCreditsError(t.error)).length,
    queueAt: turns.filter((t) => inReviewQueue(t.status)).map((t) => t.at),
  };
}

/** Questions in the Review queue asked in the last `days` days: the same rule as the sidebar badge. */
export function countQueue(conversations: Pick<InboxConversation, 'queueAt'>[], now: Date, days = 30): number {
  const since = now.getTime() - days * DAY_MS;
  let n = 0;
  for (const c of conversations) for (const at of c.queueAt) if (Date.parse(at) >= since) n++;
  return n;
}

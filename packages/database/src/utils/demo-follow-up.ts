/**
 * Demo follow-up cycle (spec 2026-10-15): pure rules shared by admin routes,
 * the digest cron and tests. No database access here.
 */
import { istDateKey, istDateTime } from './demo-schedule';

export type InterestLevel = 'hot' | 'warm' | 'cold';
export type FollowUpOutcome = 'thinking' | 'will_join' | 'no_answer' | 'not_interested' | 'joined' | 'message_sent';
export type DemoFollowUpKind = 'post_demo' | 'demo_rebook';
/** callback_outcome enum values written to callback_attempts. */
export type AttemptOutcome = 'thinking' | 'will_join' | 'not_picked_up' | 'not_interested' | 'joined' | 'message_sent';
/** How staff reached the family on an attempt (callback_attempts.channel). */
export type FollowUpChannel = 'call' | 'whatsapp';
/** What a follow-up message was about (callback_attempts.topic). */
export type FollowUpTopic = 'fees' | 'timing' | 'parents' | 'family' | 'preparation' | 'checking_in';

export const DEMO_FOLLOW_UP_KINDS: DemoFollowUpKind[] = ['post_demo', 'demo_rebook'];
export const INTEREST_LABELS: Record<InterestLevel, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };
export const FOLLOW_UP_OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
  thinking: 'Thinking it over',
  will_join: 'Will join on a date',
  no_answer: 'No answer',
  not_interested: 'Not interested',
  joined: 'Joined',
  message_sent: 'Sent a message',
};
export const FOLLOW_UP_TOPIC_LABELS: Record<FollowUpTopic, string> = {
  fees: 'Fees',
  timing: 'Timing',
  parents: 'Parents',
  family: 'Family situation',
  preparation: 'Preparation',
  checking_in: 'Just checking in',
};
export const FOLLOW_UP_TOPICS = Object.keys(FOLLOW_UP_TOPIC_LABELS) as FollowUpTopic[];
export const isFollowUpTopic = (v: unknown): v is FollowUpTopic => typeof v === 'string' && v in FOLLOW_UP_TOPIC_LABELS;

/** The last attempt on this open follow-up was a WhatsApp message: we are waiting for a reply. */
export function awaitingReply(f: { status: string; call_outcome: string | null } | null | undefined): boolean {
  return !!f && ['pending', 'scheduled', 'attempted'].includes(f.status) && f.call_outcome === 'message_sent';
}
export const NO_ANSWER_RETRY_DAYS = 2;
export const HARD_TO_REACH_AFTER = 3;
export const JOINED_PAYMENT_GRACE_DAYS = 14;
/**
 * Flag on an open follow-up parked by "Try later" after the demo: it sits on
 * the desk's Later tab until scheduled_callback_at. Any logged call clears it.
 */
export const LATER_FLAG = 'later';

const DAY = 24 * 60 * 60 * 1000;

function istAt(now: Date, dayOffset: number, hhmm: string): Date {
  return istDateTime(istDateKey(new Date(now.getTime() + dayOffset * DAY)), hhmm);
}

/** Default first follow-up after an attended demo: 2 days later, 11:00 IST. */
export function firstFollowUpAt(now: Date): Date {
  return istAt(now, 2, '11:00');
}

/** Rebook call after a no-show: next day, 11:00 IST. */
export function rebookFollowUpAt(now: Date): Date {
  return istAt(now, 1, '11:00');
}

export interface OutcomeInput {
  outcome: FollowUpOutcome;
  nextAt?: string | null;
  reason?: string | null;
  now: Date;
  /** Earlier attempt outcomes on this follow-up, newest first. */
  recent: string[];
}

export type OutcomeResult =
  | {
      status: 'scheduled' | 'completed';
      scheduledAt: string | null;
      attemptOutcome: AttemptOutcome;
      addFlags: string[];
      removeFlags: string[];
    }
  | { error: string };

export function applyFollowUpOutcome(input: OutcomeInput): OutcomeResult {
  const { outcome, now } = input;
  const next = input.nextAt ? new Date(input.nextAt) : null;
  const needsDate = outcome === 'thinking' || outcome === 'will_join' || outcome === 'message_sent';
  if (needsDate) {
    if (!next || Number.isNaN(next.getTime())) return { error: 'Pick the next follow-up date.' };
    if (next.getTime() <= now.getTime()) return { error: 'The next follow-up must be in the future.' };
    // A message sent is not an answer: it neither clears nor adds to "hard to reach".
    const removeFlags = outcome === 'message_sent' ? [LATER_FLAG] : ['hard_to_reach', LATER_FLAG];
    return { status: 'scheduled', scheduledAt: next.toISOString(), attemptOutcome: outcome, addFlags: [], removeFlags };
  }
  if (outcome === 'no_answer') {
    let streak = 1;
    for (const o of input.recent) {
      // A message we sent sits between misses ("sent, no reply, sent, no reply") without breaking the streak.
      if (o === 'message_sent') continue;
      if (o !== 'not_picked_up') break;
      streak++;
    }
    return {
      status: 'scheduled',
      scheduledAt: new Date(now.getTime() + NO_ANSWER_RETRY_DAYS * DAY).toISOString(),
      attemptOutcome: 'not_picked_up',
      addFlags: streak >= HARD_TO_REACH_AFTER ? ['hard_to_reach'] : [],
      removeFlags: [LATER_FLAG],
    };
  }
  if (outcome === 'not_interested') {
    if (!input.reason?.trim()) return { error: 'Add the reason so the team knows why.' };
    return { status: 'completed', scheduledAt: null, attemptOutcome: 'not_interested', addFlags: [], removeFlags: [LATER_FLAG] };
  }
  return { status: 'completed', scheduledAt: null, attemptOutcome: 'joined', addFlags: [], removeFlags: ['hard_to_reach', 'payment_pending', LATER_FLAG] };
}

export interface OwnerInput {
  crmOwnerId: string | null;
  crmOwnerActive: boolean;
  /** Settings followUpOwnerUpns, in order. */
  ownerOrder: string[];
  managerUpn: string | null;
  staffByUpn: Record<string, { id: string; active: boolean }>;
}

/** CRM owner, else the first active person in the order, else the manager. */
export function resolveFollowUpOwnerId(input: OwnerInput): string | null {
  if (input.crmOwnerId && input.crmOwnerActive) return input.crmOwnerId;
  for (const upn of input.ownerOrder) {
    const s = input.staffByUpn[upn.toLowerCase()];
    if (s?.active) return s.id;
  }
  const m = input.managerUpn ? input.staffByUpn[input.managerUpn.toLowerCase()] : null;
  return m?.active ? m.id : null;
}

export interface EnrolUserInput {
  linkUserId: string | null;
  signedInUserId: string;
  /** isDisposableAccount() of the signed-in row. */
  signedInIsDisposable: boolean;
}
export type EnrolUserDecision =
  | { action: 'continue'; userId: string }
  | { action: 'merge'; userId: string; mergeFrom: string }
  | { action: 'refuse'; message: string };

/** Whose account a Direct Enroll link completes under. */
export function decideEnrolUser(input: EnrolUserInput): EnrolUserDecision {
  if (!input.linkUserId || input.linkUserId === input.signedInUserId) {
    return { action: 'continue', userId: input.signedInUserId };
  }
  if (input.signedInIsDisposable) return { action: 'merge', userId: input.linkUserId, mergeFrom: input.signedInUserId };
  return { action: 'refuse', message: 'Sign in with the number you used for your demo.' };
}

export interface DigestRow {
  callback_id: string;
  user_id: string | null;
  person_name: string | null;
  person_phone: string | null;
  due_at: string;
  interest_level: InterestLevel | null;
  owner_id: string | null;
  query_type: string | null;
  flags: string[] | null;
}

function istStartOfDay(now: Date): Date {
  return istDateTime(istDateKey(now), '00:00');
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? '' : 's'}`;
}

/** One owner's morning message: overdue first, then today, Hot marked. */
export function buildOwnerDigest(rows: DigestRow[], now: Date, adminOrigin: string): { subject: string; plain: string; link: string } {
  const start = istStartOfDay(now).getTime();
  const sorted = [...rows].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  const overdue = sorted.filter((r) => new Date(r.due_at).getTime() < start).length;
  const hot = sorted.filter((r) => r.interest_level === 'hot').length;
  const extras = [overdue ? `${overdue} overdue` : null, hot ? `${hot} Hot` : null].filter(Boolean).join(', ');
  const subject = `${plural(sorted.length, 'follow-up')} today${extras ? ` (${extras})` : ''}`;
  const lines = sorted.map((r) => {
    const tag = [
      new Date(r.due_at).getTime() < start ? 'overdue' : null,
      r.interest_level ? INTEREST_LABELS[r.interest_level] : null,
      r.query_type === 'post_demo' ? 'after demo' : r.query_type === 'demo_rebook' ? 'rebook demo' : 'callback',
    ]
      .filter(Boolean)
      .join(', ');
    return `${r.person_name || r.person_phone || 'Unnamed'} (${tag})`;
  });
  return { subject, plain: [subject, ...lines].join('\n'), link: `${adminOrigin}/follow-ups?range=today&mine=true` };
}

/** The manager's view: per owner due, overdue and done yesterday; Hot overdue by name. */
export function buildManagerSummary(
  rows: DigestRow[],
  doneYesterday: Record<string, number>,
  ownerNames: Record<string, string>,
  now: Date,
  adminOrigin: string,
): { subject: string; plain: string; link: string } {
  const start = istStartOfDay(now).getTime();
  const owners = Array.from(new Set([...Object.keys(ownerNames), ...rows.map((r) => r.owner_id || 'none')]));
  const lines = owners
    .filter((o) => o !== 'none' || rows.some((r) => !r.owner_id))
    .map((o) => {
      const mine = rows.filter((r) => (r.owner_id || 'none') === o);
      const late = mine.filter((r) => new Date(r.due_at).getTime() < start).length;
      return `${ownerNames[o] || 'Nobody assigned'}: ${mine.length} due (${late} overdue), ${doneYesterday[o] || 0} done yesterday`;
    });
  const hotLate = rows.filter((r) => r.interest_level === 'hot' && new Date(r.due_at).getTime() < start).map((r) => r.person_name || r.person_phone || 'Unnamed');
  const subject = `Team follow-ups: ${rows.length} due today`;
  const plain = [subject, ...lines, ...(hotLate.length ? [`Hot and overdue: ${hotLate.join(', ')}`] : [])].join('\n');
  return { subject, plain, link: `${adminOrigin}/follow-ups?range=today` };
}

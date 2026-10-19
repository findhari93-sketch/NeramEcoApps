/**
 * Confirm who is coming: ask, chase, record.
 *
 * The forecast says "~23 of 41 likely". That number is a sum of chances, and a
 * chance cannot be phoned. This module turns it into a list of people:
 *
 *   1. ASK      the students whose record says they often miss
 *   2. REPLY    they tap "I'll be there", or give a reason (one class or days)
 *   3. CHASE    the office calls whoever was asked and said nothing
 *   4. RECORD   staff type in what they were told on the phone
 *
 * Missing class is fine. Missing it WITHOUT A REASON is the thing being chased,
 * and the silent-absence ladder (lib/silent-streak.ts) already deals with it
 * after the class. This catches it before.
 *
 * PURE and client-safe: no fetch, no Supabase, no Date.now(). The route and the
 * sheet both read status through confirmStatusOf so the two cannot disagree.
 */
import { baseTurnoutRate, turnoutProbability, turnoutRecord, type TurnoutRecord } from './attendance-standing';
import { dayBatchIds, isNewcomer, onRollFor, type ForecastStudent } from './class-forecast';
import type { RsvpClassSummary, RsvpDaySummary } from '@/app/api/timetable/rsvp-dashboard/route';

/**
 * Where a student stands for one class, in the order the facts outrank each
 * other.
 *
 * Away outranks everything because a declared window explains every class it
 * covers on its own (the register's rule, registerGroupOf). A reason outranks a
 * yes, because a student who said "coming" and later "unwell" changed their
 * mind, and the later, more specific statement is the true one; the routes also
 * clear the yes when a reason is written, so this is a second belt. Only after
 * all three is "asked and silent" left, which is the call list.
 */
export type ConfirmStatus = 'away' | 'not_coming' | 'coming' | 'no_reply' | 'not_asked';

export const CONFIRM_STATUSES: ConfirmStatus[] = ['no_reply', 'not_asked', 'coming', 'not_coming', 'away'];

export function confirmStatusOf(input: {
  away: boolean;
  declined: boolean;
  confirmedAt: string | null | undefined;
  askedAt: string | null | undefined;
}): ConfirmStatus {
  if (input.away) return 'away';
  if (input.declined) return 'not_coming';
  if (input.confirmedAt) return 'coming';
  if (input.askedAt) return 'no_reply';
  return 'not_asked';
}

/** Short enough for a chip at 375px. Words, never a colour on its own. */
export const STATUS_LABEL: Record<ConfirmStatus, string> = {
  coming: 'Coming',
  not_coming: 'Not coming',
  away: 'Away',
  no_reply: 'No reply',
  not_asked: 'Not asked',
};

/**
 * Below this chance of turning up, a student is worth asking.
 *
 * The founder's pick (2026-10-19). Wider than RARELY_COMES_RATE (40%) on
 * purpose: the "about 10 fewer" on the card is spread across everyone with a
 * patchy record, not only the students below 40%, so asking only those would
 * leave most of the gap unexplained.
 */
export const ASK_CHANCE_BELOW = 0.6;

/** A second ask inside this window is skipped, so a double tap is one message. */
export const RE_ASK_AFTER_MS = 3 * 60 * 60 * 1000;

export interface AskCandidate {
  id: string;
  name: string;
  avatar_url: string | null;
  /** 0 to 1. */
  chance: number;
  record: TurnoutRecord;
}

/** Each student's chance of being in the room, from the same model the forecast sums. */
export function chanceById(students: ForecastStudent[] | null | undefined): Map<string, number> {
  const roster = students || [];
  const base = baseTurnoutRate(roster);
  return new Map(roster.map((s) => [s.id, turnoutProbability(s, base).p] as const));
}

/**
 * Who the Ask button ticks by default for a day.
 *
 * On the roll that date, not away, not already declined, not already confirmed,
 * not a newcomer (two weeks of nothing is not a record, the forecast's own
 * promise), and below ASK_CHANCE_BELOW. Worst chance first, so the top of the
 * list is the top of the office's call sheet.
 */
export function pickAskList(input: {
  day: Pick<RsvpDaySummary, 'date' | 'class_ids' | 'away_ids' | 'declined_ids' | 'confirmed_ids'>;
  classes: Pick<RsvpClassSummary, 'class_id' | 'batch_id'>[];
  students: ForecastStudent[] | null | undefined;
  today: string;
}): AskCandidate[] {
  const { day, classes, students, today } = input;
  const roster = students || [];
  const batchIds = dayBatchIds(day, new Map(classes.map((c) => [c.class_id, c] as const)));
  const excluded = new Set([...day.away_ids, ...day.declined_ids, ...(day.confirmed_ids || [])]);
  const chances = chanceById(roster);

  return roster
    .filter((s) => onRollFor(s, day.date, batchIds) && !excluded.has(s.id) && !isNewcomer(s, today))
    .map((s) => ({
      id: s.id,
      name: s.name,
      avatar_url: s.avatar_url,
      chance: chances.get(s.id) ?? 1,
      record: turnoutRecord(s),
    }))
    .filter((c) => c.chance < ASK_CHANCE_BELOW)
    .sort((a, b) => a.chance - b.chance || a.name.localeCompare(b.name));
}

/**
 * The Assistant's message, before any edit.
 *
 * `{firstName}` is filled per student by sendNudge. The last line states the
 * rule in the founder's terms, so nobody is chased later for something they
 * were never told.
 */
export function defaultAskMessage(input: { classTitle: string; whenLabel: string }): string {
  return (
    `Hi {firstName}, will you be in ${input.classTitle} ${input.whenLabel}? ` +
    'Tap below to tell us. If you cannot come, just give a reason. ' +
    'Missing class is OK, missing it without telling us is not.'
  );
}

/** "6 confirmed, 3 no reply". Empty string when neither has happened. */
export function confirmSummaryLabel(confirmed: number, noReply: number): string {
  return [confirmed > 0 ? `${confirmed} confirmed` : '', noReply > 0 ? `${noReply} no reply` : '']
    .filter(Boolean)
    .join(', ');
}

/** True when this ask would repeat one sent moments ago. */
export function askedRecently(askedAt: string | null | undefined, nowMs: number): boolean {
  if (!askedAt) return false;
  const t = Date.parse(askedAt);
  return Number.isFinite(t) && nowMs - t < RE_ASK_AFTER_MS;
}

/** "19:00" to "7 PM", "19:30" to "7:30 PM". The input unchanged if unparseable. */
function shortTime(time: string | null | undefined): string {
  const [h, m] = (time ?? '').split(':');
  const hour = parseInt(h, 10);
  const mins = parseInt(m, 10);
  if (Number.isNaN(hour) || Number.isNaN(mins)) return time ?? '';
  const h12 = hour % 12 || 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return mins === 0 ? `${h12} ${ampm}` : `${h12}:${String(mins).padStart(2, '0')} ${ampm}`;
}

/**
 * "today at 7 PM", "tomorrow at 7 PM", "on Thu 23 Oct at 7 PM".
 *
 * Relative to `today` (IST YYYY-MM-DD) rather than the clock, so the message
 * and the test agree about which day "today" is.
 */
export function whenLabel(date: string, startTime: string | null | undefined, today: string): string {
  const at = startTime ? ` at ${shortTime(startTime)}` : '';
  const dayMs = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  const days = Math.round(dayMs / 86_400_000);
  if (days === 0) return `today${at}`;
  if (days === 1) return `tomorrow${at}`;
  const d = new Date(`${date}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return `on ${date}${at}`;
  const label = d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
  return `on ${label.replace(/,/g, '')}${at}`;
}

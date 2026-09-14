/**
 * Not started: the rules for students who have never entered Nexus.
 *
 * A photo is the way in (the student.photo-gate flag). Until a student gets past
 * it, their enrolment is dormant with dormant_source = 'auto', so they sit in no
 * list and no count, exactly like a student staff paused. The two differ in who
 * decides and how they leave:
 *
 *   Not started (auto)  set on enrolment by a DB trigger (20260919090000), lifted
 *                       here, by /api/auth/me, the first time they get in.
 *   Paused (staff)      set and cleared only by staff, with a reason. Signing in
 *                       again flags them "Back in Nexus"; it never brings them back.
 *
 * Everything in this file is pure, so the route stays a thin caller and the
 * decisions are pinned in not-started.test.ts.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Automatic "come into Nexus" reminders go out on these days after joining, then stop. */
export const JOIN_REMINDER_DAYS = [1, 3, 7] as const;

/** After this many days Not started, the Students page asks staff to decide. */
export const NOT_STARTED_DECISION_DAYS = 14;

/** /api/auth/me runs on every app open; one sign-in row per student per this window. */
export const SIGN_IN_EVENT_THROTTLE_MS = 30 * 60 * 1000;

export type SignInOutcome = 'entered' | 'photo_step';
export type SignInDevice = 'Phone' | 'Tablet' | 'Laptop';

interface ParticipationRow {
  participation_status?: string | null;
  dormant_source?: string | null;
  dormant_since?: string | null;
}

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Whole days from `since` to `now`, never negative. Null when `since` is missing. */
export function daysSince(since: string | null | undefined, now: number = Date.now()): number | null {
  const t = timeOf(since);
  if (t === null) return null;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** Enrolled but never entered Nexus. */
export function isNotStarted(row: ParticipationRow | null | undefined): boolean {
  return !!row && row.participation_status === 'dormant' && row.dormant_source === 'auto';
}

/** Paused by a person. A dormant row with no source predates 20260919090000 and was staff. */
export function isPausedByStaff(row: ParticipationRow | null | undefined): boolean {
  return !!row && row.participation_status === 'dormant' && row.dormant_source !== 'auto';
}

/**
 * Which join reminder (1, 2 or 3) is due now, or null.
 *
 * One reminder per run at most: a student Not started for a month (the backfill)
 * gets 1, 2 and 3 on three consecutive days, never three messages at once.
 */
export function joinReminderDue(
  dormantSince: string | null | undefined,
  sent: number | null | undefined,
  now: number = Date.now(),
): 1 | 2 | 3 | null {
  const days = daysSince(dormantSince, now);
  if (days === null) return null;
  const already = Math.max(0, Number(sent) || 0);
  if (already >= JOIN_REMINDER_DAYS.length) return null;
  return days >= JOIN_REMINDER_DAYS[already] ? ((already + 1) as 1 | 2 | 3) : null;
}

/** Not started long enough that staff should decide: remind again, or pause with a reason. */
export function needsDecision(row: ParticipationRow | null | undefined, now: number = Date.now()): boolean {
  if (!isNotStarted(row)) return false;
  const days = daysSince(row?.dormant_since, now);
  return days !== null && days >= NOT_STARTED_DECISION_DAYS;
}

/** Paused by staff, but opened Nexus after they were paused. Staff decide; nothing flips on its own. */
export function backInNexus(
  row: ParticipationRow | null | undefined,
  lastSignInAt: string | null | undefined,
): boolean {
  if (!isPausedByStaff(row)) return false;
  const paused = timeOf(row?.dormant_since);
  const seen = timeOf(lastSignInAt);
  return paused !== null && seen !== null && seen > paused;
}

/** A coarse device word for the sign-in history. Never stores the raw User-Agent. */
export function deviceFromUserAgent(ua: string | null | undefined): SignInDevice | null {
  const s = String(ua || '');
  if (!s) return null;
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) return 'Tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(s)) return 'Phone';
  if (/Windows|Macintosh|Linux|CrOS|X11/i.test(s)) return 'Laptop';
  return null;
}

export interface EntryInput {
  isStudent: boolean;
  impersonating: boolean;
  /**
   * At least one live classroom. Without one the photo gate never applies (the
   * student sees the "not in a class yet" screen), so passing it proves nothing.
   */
  hasClassroom: boolean;
  /** photoGate.required from /api/auth/me: true means the gate stopped them. */
  photoGateRequired: boolean;
  /** users.nexus_entered_at before this request. */
  enteredAt: string | null;
  /** users.nexus_last_login_at before this request (this request stamps it after). */
  lastLoginAt: string | null;
  now?: number;
}

export interface EntryPlan {
  /** Write a nexus_sign_in_events row with this outcome, or skip. */
  logOutcome: SignInOutcome | null;
  /** First time past the gate: stamp nexus_entered_at and lift Not started enrolments. */
  firstEntry: boolean;
}

/**
 * What /api/auth/me should record for this app open.
 *
 * Staff, parents and View as Student never write anything. The sign-in row is
 * throttled on the previous nexus_last_login_at, which is exactly "the last time
 * the app was opened", so a student flicking between tabs is one row, not ten.
 * First entry is never throttled: it is the one write that changes counts.
 */
export function planEntry(input: EntryInput): EntryPlan {
  if (!input.isStudent || input.impersonating || !input.hasClassroom) {
    return { logOutcome: null, firstEntry: false };
  }
  const now = input.now ?? Date.now();
  const last = timeOf(input.lastLoginAt);
  const fresh = last === null || now - last >= SIGN_IN_EVENT_THROTTLE_MS;
  const firstEntry = !input.photoGateRequired && !input.enteredAt;
  const outcome: SignInOutcome = input.photoGateRequired ? 'photo_step' : 'entered';
  return { logOutcome: fresh || firstEntry ? outcome : null, firstEntry };
}

export interface JoinReminderMessage {
  subject: string;
  plain: string;
  buttonLabel: string;
}

/**
 * The three join reminders. {firstName} is filled in by sendNudge. The third says
 * it is the last, so a student who is really stuck knows to reply rather than wait.
 */
export function joinReminderMessage(step: 1 | 2 | 3): JoinReminderMessage {
  if (step === 1) {
    return {
      subject: 'Your class is waiting for you in Nexus',
      plain:
        'Hi {firstName}, your Neram class is waiting for you in Nexus. Open Nexus, add your profile photo, and you are in. It takes about a minute.',
      buttonLabel: 'Open Nexus',
    };
  }
  if (step === 2) {
    return {
      subject: 'You have not opened Nexus yet',
      plain:
        'Hi {firstName}, you have not opened Nexus yet. Your classes, tests and study material are all there. Add your profile photo to get in.',
      buttonLabel: 'Open Nexus',
    };
  }
  return {
    subject: 'One last reminder to start in Nexus',
    plain:
      'Hi {firstName}, this is our last reminder. Open Nexus and add your profile photo to start. If something is stopping you, reply here and your teacher will help.',
    buttonLabel: 'Open Nexus',
  };
}

/**
 * A participation audit row as a sentence for the profile timeline. from_value
 * 'not_started' is written by the classification route when staff act on a Not
 * started student; system rows (the enrolment trigger, the first-entry lift)
 * carry performed_by NULL and their own reason text.
 */
export function participationEventTitle(
  from: string | null | undefined,
  to: string | null | undefined,
  reason: string | null | undefined,
): string {
  if (to === 'active' && reason === 'Entered Nexus') return 'Entered Nexus, now counted in class numbers';
  if (to === 'dormant' && reason?.startsWith('Not started')) return 'Marked Not started (has not entered Nexus)';
  if (from === 'not_started' && to === 'active') return 'Counted in class numbers by staff';
  if (to === 'dormant') return 'Paused by staff';
  if (to === 'active') return 'Brought back by staff';
  return 'Participation changed';
}

// ── The Dormant segment on the Students page ────────────────────────────────

/**
 * The narrowing inside the Dormant segment. `not_started_long` is what the Needs
 * attention row opens: Not started for NOT_STARTED_DECISION_DAYS or more.
 */
export type DormantView = 'all' | 'not_started' | 'not_started_long' | 'paused' | 'back_in_nexus';

export const DORMANT_VIEWS: readonly DormantView[] = ['all', 'not_started', 'not_started_long', 'paused', 'back_in_nexus'];

export interface DormantRow extends ParticipationRow {
  dormant_reason?: string | null;
  dormant_by_name?: string | null;
  last_seen_at?: string | null;
  last_sign_in?: { at: string; outcome: string } | null;
  join_reminders_sent?: number | null;
  attendance?: { attended?: number | null } | null;
}

export function matchesDormantView(row: DormantRow, view: DormantView, now: number = Date.now()): boolean {
  switch (view) {
    case 'not_started':
      return isNotStarted(row);
    case 'not_started_long':
      return needsDecision(row, now);
    case 'paused':
      return isPausedByStaff(row);
    case 'back_in_nexus':
      return backInNexus(row, row.last_seen_at);
    default:
      return row.participation_status === 'dormant';
  }
}

export function dormantViewCounts(rows: DormantRow[], now: number = Date.now()): Record<DormantView, number> {
  const counts = { all: 0, not_started: 0, not_started_long: 0, paused: 0, back_in_nexus: 0 };
  for (const row of rows) {
    for (const view of DORMANT_VIEWS) if (matchesDormantView(row, view, now)) counts[view] += 1;
  }
  return counts;
}

export type DormantDetailKind = 'paused' | 'back_in_nexus' | 'not_started' | 'photo_step' | 'teams' | 'reminded';

export interface DormantDetail {
  kind: DormantDetailKind;
  text: string;
  tone: 'neutral' | 'warning';
}

function relative(iso: string, now: number): string {
  const days = daysSince(iso, now) ?? 0;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `on ${shortDay(iso)}`;
}

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What a dormant card says in words, so nobody has to hover a chip to learn why a
 * student is out of the numbers. Empty for a participating student.
 *
 *   Paused:      "Paused 10 Sept by Hari: She is asking for refund"
 *                "Back in Nexus 2 days ago"                        (when true)
 *   Not started: "Not started for 27 days"
 *                "Stopped at the photo step yesterday"             (when they tried)
 *                "Attended 5 classes on Teams"                      (when they did)
 *                "Reminded 3 times"                                 (when sent)
 */
export function dormantDetailsOf(row: DormantRow, now: number = Date.now()): DormantDetail[] {
  if (row.participation_status !== 'dormant') return [];
  const details: DormantDetail[] = [];

  if (isPausedByStaff(row)) {
    const since = row.dormant_since ? ` ${shortDay(row.dormant_since)}` : '';
    const by = row.dormant_by_name ? ` by ${row.dormant_by_name}` : '';
    const why = row.dormant_reason ? `: ${row.dormant_reason}` : '';
    details.push({ kind: 'paused', text: `Paused${since}${by}${why}`, tone: 'neutral' });
    if (backInNexus(row, row.last_seen_at) && row.last_seen_at) {
      details.push({ kind: 'back_in_nexus', text: `Back in Nexus ${relative(row.last_seen_at, now)}`, tone: 'warning' });
    }
    return details;
  }

  const days = daysSince(row.dormant_since, now);
  details.push({
    kind: 'not_started',
    text: days === null || days === 0 ? 'Not started, joined today' : `Not started for ${plural(days, 'day', 'days')}`,
    tone: needsDecision(row, now) ? 'warning' : 'neutral',
  });
  if (row.last_sign_in?.outcome === 'photo_step') {
    details.push({
      kind: 'photo_step',
      text: `Stopped at the photo step ${relative(row.last_sign_in.at, now)}`,
      tone: 'warning',
    });
  }
  const attended = Number(row.attendance?.attended) || 0;
  if (attended > 0) {
    details.push({ kind: 'teams', text: `Attended ${plural(attended, 'class', 'classes')} on Teams`, tone: 'neutral' });
  }
  const reminded = Number(row.join_reminders_sent) || 0;
  if (reminded > 0) {
    details.push({ kind: 'reminded', text: `Reminded ${plural(reminded, 'time', 'times')}`, tone: 'neutral' });
  }
  return details;
}

/** "Entered Nexus" / "Stopped at the photo step", for the sign-in history. */
export function signInOutcomeLabel(outcome: string | null | undefined): string {
  return outcome === 'photo_step' ? 'Stopped at the photo step' : 'Entered Nexus';
}

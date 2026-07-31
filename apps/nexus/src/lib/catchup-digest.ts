/**
 * What the daily catch-up digest says.
 *
 * Pure copy building, no I/O, no database. Everything here is a decision about
 * words, and the two decisions worth stating out loud are both encoded as tests:
 *
 * 1. ONE MESSAGE A DAY, NOT ONE PER EVENT. Students explain absences and finish
 *    catch-ups all through the morning. A ping each would fire a dozen times
 *    before lunch, which is how a bell gets ignored. The live signal is the nav
 *    badge; this is the summary.
 *
 * 2. A PARENT IS TOLD THE CATEGORY, NEVER THE CHILD'S TYPED NOTE. A student
 *    writes that note for their teacher. Forwarding it turns a private
 *    explanation into something read at home, which would very quickly teach
 *    students to write nothing worth reading. The single exception is a reason a
 *    parent gave themselves (`reason_source === 'parent'`), where the words are
 *    already theirs.
 *
 * Delivery lives in the cron route. This module only decides what to say.
 */
import { reasonShortLabel } from './rsvp-reasons';

/** Teams truncates an activity notification at 150 characters. */
export const TEAMS_TEXT_LIMIT = 150;

export interface DigestEvent {
  kind: 'reason' | 'completed';
  studentId: string;
  studentName: string | null;
  classId: string;
  classTitle: string | null;
  /** YYYY-MM-DD of the class that was missed. */
  scheduledDate: string;
  reasonCode: string | null;
  reasonNote: string | null;
  /** 'student' | 'parent' | 'teacher' | null. Decides whether a note may be forwarded. */
  reasonSource: string | null;
  caughtUpAt: string | null;
  /** When the catch-up is due, when it is not done yet. */
  dueOn: string | null;
}

export interface ParentChildEvents {
  childName: string | null;
  events: DigestEvent[];
}

export interface StaffDigest {
  title: string;
  message: string;
  /** Kept under TEAMS_TEXT_LIMIT so Teams does not cut it mid-word. */
  teamsText: string;
}

export interface ParentNotice {
  subject: string;
  /** Plain text. The caller renders HTML from this with plainToHtml. */
  plain: string;
}

/** "29 Jul", in IST so an evening class keeps its own date. */
function shortDate(ymd: string | null): string {
  if (!ymd) return '';
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return String(ymd);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Distinct students, because two absences from one person is still one person. */
function countStudents(events: DigestEvent[]): number {
  return new Set(events.map((e) => e.studentId)).size;
}

/** Cut to a limit on a word boundary, so Teams never shows half a name. */
export function clampText(text: string, limit = TEAMS_TEXT_LIMIT): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

/**
 * The staff roll-up for one classroom's last 24 hours.
 *
 * Returns null when there is nothing to report, which is the normal case on a
 * quiet day. The cron relies on that: an empty digest is worse than no digest,
 * because it trains people that the bell means nothing.
 */
export function buildStaffDigest(events: DigestEvent[]): StaffDigest | null {
  const reasons = events.filter((e) => e.kind === 'reason');
  const completed = events.filter((e) => e.kind === 'completed');
  if (reasons.length === 0 && completed.length === 0) return null;

  const explainers = countStudents(reasons);
  const finishers = countStudents(completed);

  const parts: string[] = [];
  if (explainers > 0) {
    parts.push(
      `${plural(explainers, 'student', 'students')} explained why they missed a class`,
    );
  }
  if (finishers > 0) {
    parts.push(`${plural(finishers, 'student', 'students')} finished their catch-up`);
  }
  const message = `${parts.join(', and ')}.`;

  // The single most useful detail on the notification itself: who, and what they
  // said. Only when there is exactly one, otherwise the digest becomes a list
  // and the whole point was that it is one line.
  const detail =
    reasons.length === 1 && reasons[0].studentName
      ? ` ${reasons[0].studentName}: ${reasonShortLabel(reasons[0].reasonCode).toLowerCase()}, ${
          reasons[0].classTitle || 'class'
        } on ${shortDate(reasons[0].scheduledDate)}.`
      : '';

  const title =
    explainers > 0 && finishers > 0
      ? 'Catch-up: new reasons and completions'
      : explainers > 0
        ? 'New reasons for missing class'
        : 'Catch-ups finished';

  return {
    title,
    message: `${message}${detail}`,
    teamsText: clampText(`${title}. ${message}`),
  };
}

/**
 * What one parent is told, covering every child they are linked to.
 *
 * Notice what is NOT here: `reasonNote` is only ever read when the parent wrote
 * it themselves. See the module header.
 */
export function buildParentNotice(children: ParentChildEvents[]): ParentNotice | null {
  const withEvents = children.filter((c) => c.events.length > 0);
  if (withEvents.length === 0) return null;

  const lines: string[] = [];
  let missedTotal = 0;

  for (const child of withEvents) {
    const name = child.childName || 'Your child';
    const missed = child.events.filter((e) => e.kind === 'reason');
    const done = child.events.filter((e) => e.kind === 'completed');
    missedTotal += missed.length;

    for (const e of missed) {
      const what = `${name} missed ${e.classTitle || 'a class'} on ${shortDate(e.scheduledDate)}.`;
      const why = e.reasonCode
        ? ` Reason given: ${reasonShortLabel(e.reasonCode).toLowerCase()}.`
        : ' No reason has been given yet.';
      // Their own words, echoed back to them. A student's note is never here.
      const ownWords =
        e.reasonSource === 'parent' && e.reasonNote ? ` You told us: "${e.reasonNote}".` : '';
      const next = e.caughtUpAt
        ? ' The catch-up for it is already done.'
        : e.dueOn
          ? ` The catch-up for it is due by ${shortDate(e.dueOn)}.`
          : ' The catch-up for it is still open.';
      lines.push(`${what}${why}${ownWords}${next}`);
    }

    for (const e of done) {
      lines.push(
        `${name} finished the catch-up for ${e.classTitle || 'a class'} on ${shortDate(
          e.scheduledDate,
        )}. Nothing is outstanding for that class.`,
      );
    }
  }

  const subject =
    missedTotal > 0
      ? withEvents.length === 1 && withEvents[0].childName
        ? `${withEvents[0].childName} missed a class`
        : 'A missed class at Neram Classes'
      : 'Catch-up finished at Neram Classes';

  const plain = [
    'Hello,',
    '',
    ...lines,
    '',
    'A missed class is not a problem on its own. Every recorded class can be watched later, and the catch-up is marked done once the recording and the work are finished.',
    '',
    'You can see the full picture any time by signing in to the parent portal.',
    '',
    'Neram Classes',
  ].join('\n');

  return { subject, plain };
}

/**
 * The list a teacher pastes somewhere else.
 *
 * Kept out of the component and out of the API on purpose. Everything below is
 * already on the client, and what a teacher wants is not another screen: it is
 * plain text they can drop into a WhatsApp message to a co-teacher, a parent
 * email, or their own notes. So it is a pure function of the payload, unit
 * testable, and it costs nothing to produce.
 */

import { reasonShortLabel } from '@/lib/rsvp-reasons';
import type { Insights, StudentInsight } from './types';

function progress(s: StudentInsight): string {
  const a = s.absence;
  if (a?.excused_at) return 'excused';
  if (a?.caught_up_at) return 'caught up';
  if (a?.recording_watched_at) return 'watched the recording, check not taken';
  return 'recording not watched';
}

function classHeading(insights: Insights): string {
  const { title, scheduled_date, start_time } = insights.class;
  const date = scheduled_date
    ? new Date(`${scheduled_date}T00:00:00`).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : null;
  return [title, date, start_time ? start_time.substring(0, 5) : null].filter(Boolean).join(', ');
}

/**
 * Everyone who has not caught up on this class, grouped the same way the panel
 * groups them, so the text and the screen say the same thing.
 *
 * `only` narrows it to a selection; without it the whole outstanding list is
 * written out.
 */
export function buildMissedList(insights: Insights, only?: Set<string>): string {
  const chosen = (s: StudentInsight) => (only && only.size > 0 ? only.has(s.id) : true);
  const silent = insights.students.filter((s) => s.bucket === 'missed_no_reason' && chosen(s));
  const explained = insights.students.filter((s) => s.bucket === 'missed_with_reason' && chosen(s));
  const lateJoiners = insights.students.filter((s) => s.bucket === 'late_joiner' && chosen(s));

  const lines: string[] = [classHeading(insights)];
  lines.push(
    `Not caught up (${silent.length + explained.length + lateJoiners.length} of ${insights.summary.rosterSize})`,
    '',
  );

  let n = 0;
  if (silent.length) {
    lines.push(`No reason given (${silent.length})`);
    for (const s of silent) lines.push(`  ${++n}. ${s.name}, never joined, ${progress(s)}`);
    lines.push('');
  }
  if (explained.length) {
    lines.push(`Told us why (${explained.length})`);
    for (const s of explained) {
      const why = s.absence?.reason_code
        ? reasonShortLabel(s.absence.reason_code)
        : s.absence?.reason_note || 'reason given';
      lines.push(`  ${++n}. ${s.name}, ${why}, ${progress(s)}`);
    }
    lines.push('');
  }
  // Held apart in the pasted text for the same reason as on the screen: this
  // list gets forwarded to a co-teacher or a parent, and a late joiner reading
  // as somebody who skipped a class is the exact misunderstanding to avoid.
  if (lateJoiners.length) {
    lines.push(`Joined after this class (${lateJoiners.length})`);
    for (const s of lateJoiners) {
      lines.push(`  ${++n}. ${s.name}, enrolled later, ${progress(s)}`);
    }
  }

  if (n === 0) return `${classHeading(insights)}\nEveryone has caught up on this class.`;
  return lines.join('\n').trim();
}

/** Attended students, ranked, as text. Mirrors the Attended tab's order. */
export function buildAttendedList(insights: Insights, ranked: StudentInsight[]): string {
  const lines: string[] = [
    classHeading(insights),
    `Attended ${insights.summary.present} of ${insights.summary.rosterSize}, shortest stay first`,
    '',
  ];
  ranked.forEach((s, i) => {
    const mins = s.duration_minutes == null ? 'duration not reported' : `${s.duration_minutes}m`;
    const flags = [
      s.barelyAttended ? 'barely attended' : null,
      s.joinedLate ? 'late' : null,
      s.leftEarly ? 'left early' : null,
      s.droppedMidClass ? 'dropped and rejoined' : null,
    ].filter(Boolean);
    lines.push(`  ${i + 1}. ${s.name}, ${mins}${flags.length ? `, ${flags.join(', ')}` : ''}`);
  });
  return lines.join('\n').trim();
}

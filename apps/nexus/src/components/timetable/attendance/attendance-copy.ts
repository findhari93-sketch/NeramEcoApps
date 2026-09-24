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
import { reasonChip } from '@/lib/absence-reason';
import { FOLLOWUP_META, stateFromBucket, type FollowupState } from '@/lib/class-followup';
import type { Insights, StudentInsight } from './types';

function progress(s: StudentInsight): string {
  const a = s.absence;
  if (a?.excused_at) return 'excused';
  if (a?.caught_up_at) return 'caught up';
  if (s.catchup?.progress) return s.catchup.progress.charAt(0).toLowerCase() + s.catchup.progress.slice(1);
  if (s.catchup?.watched || a?.recording_watched_at) return 'watched the recording, check not taken';
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

/** The copied groups, in the panel's order: everyone who still owes the class. */
const COPY_ORDER: FollowupState[] = ['needs_call', 'catching_up', 'waiting_on_us', 'late_joiner'];

function reasonOf(s: StudentInsight): string {
  const r = s.reason_resolved;
  if (r) return r.note ? `${reasonChip(r)} (${r.note})` : r.unspecified ? 'told us before class' : `${reasonChip(r)}, ${r.said.toLowerCase()}`;
  if (s.away_window) return s.away_window;
  if (s.absence?.reason_code) return reasonShortLabel(s.absence.reason_code);
  return s.absence?.reason_note || 'reason given';
}

/**
 * Everyone who has not caught up on this class, grouped the same way the panel
 * groups them, so the text and the screen say the same thing.
 *
 * `only` narrows it to a selection; without it the whole outstanding list is
 * written out. Students on declared leave are in it: they used to be dropped
 * from the pasted list altogether, because their bucket matched no group.
 */
export function buildMissedList(insights: Insights, only?: Set<string>): string {
  const chosen = (s: StudentInsight) => (only && only.size > 0 ? only.has(s.id) : true);
  const byState = new Map<FollowupState, StudentInsight[]>();
  for (const st of COPY_ORDER) byState.set(st, []);
  for (const s of insights.students) {
    if (!chosen(s)) continue;
    byState.get(s.followup ?? stateFromBucket(s.bucket))?.push(s);
  }
  const total = COPY_ORDER.reduce((n, st) => n + (byState.get(st)?.length ?? 0), 0);

  const lines: string[] = [classHeading(insights)];
  lines.push(`Not caught up (${total} of ${insights.summary.rosterSize})`, '');

  let n = 0;
  for (const st of COPY_ORDER) {
    const list = byState.get(st) || [];
    if (list.length === 0) continue;
    lines.push(`${FOLLOWUP_META[st].label} (${list.length})`);
    for (const s of list) {
      // Held apart in the pasted text for the same reason as on the screen:
      // this list gets forwarded, and a late joiner reading as somebody who
      // skipped a class is the exact misunderstanding to avoid.
      const why =
        st === 'needs_call'
          ? 'no reason given'
          : st === 'late_joiner'
            ? 'enrolled later'
            : st === 'waiting_on_us'
              ? 'waiting on our recap'
              : reasonOf(s);
      lines.push(`  ${++n}. ${s.name}, ${why}, ${progress(s)}`);
    }
    lines.push('');
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

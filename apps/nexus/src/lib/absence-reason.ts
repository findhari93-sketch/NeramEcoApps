/**
 * One answer to "why did this student miss this class", wherever they said it.
 *
 * A student can tell us in three places, and until now each screen read one:
 *
 *   1. Before the class, by declining the RSVP (`nexus_class_rsvp`).
 *   2. For a stretch of days, by declaring an away window
 *      (`nexus_student_away_windows`, see away-windows.ts).
 *   3. After the class, on the catch-up screen (`nexus_class_absences.reason_*`),
 *      or a parent on their behalf.
 *
 * The catch-up screen only ever read (3). The RSVP reason was meant to be copied
 * onto the absence row, but `deriveNoShows` writes that row first and the copy
 * is skipped (see the absence-derivation race memory), and an away window's
 * reason was never copied at all. So a student who had already told us was
 * asked again, and the teacher's Reasons list missed most of what students said.
 *
 * This resolves the three at READ time instead of copying. A copy made during
 * derivation is exactly what broke; a read cannot go stale.
 *
 * Precedence matches `registerGroupOf` (attendance-register.ts) and `bucketFor`
 * (attendance-quality.ts), which already agree with each other:
 *   an away window outranks a per-class reason, because a one-off opt-out
 *   inside a fortnight of exam leave is better explained by the fortnight;
 *   and of the per-class reasons, what was written on the absence row itself
 *   (by the student afterwards, or a parent, or a teacher) outranks the RSVP,
 *   because it is the later and more considered statement about this class.
 *
 * Pure: no I/O, so the student route, the overview and the tests all agree.
 */

import type { AwayWindow } from './away-windows';
import { coveringWindow, formatDay } from './away-windows';
import { isRsvpReasonCode, reasonShortLabel, type RsvpReasonCode } from './rsvp-reasons';

export type ReasonSource = 'before_class' | 'away' | 'after_class' | 'parent' | 'teacher';

export interface ResolvedReason {
  /** Always one of the four shared codes; an unknown stored code reads as 'other'. */
  code: RsvpReasonCode;
  /** What the person typed, trimmed. Null when they only picked a category. */
  note: string | null;
  source: ReasonSource;
  /** When they told us, if known. */
  at: string | null;
  /** For an away window, its span, so the reader can say "Away 10 to 20 Sept". */
  window?: { id: string; starts_on: string; ends_on: string | null } | null;
  /**
   * True when an RSVP decline carried neither a category nor a note. They told
   * us in advance they would miss it, just not why, so the reader should say
   * that rather than pretend the category was "Other".
   */
  unspecified?: boolean;
}

export interface AbsenceReasonFields {
  reason_code?: string | null;
  reason_note?: string | null;
  reason_submitted_at?: string | null;
  reason_source?: string | null;
}

export interface RsvpReasonFields {
  response?: string | null;
  reason_code?: string | null;
  /** The RSVP table calls its free text `reason`, not `reason_note`. */
  reason?: string | null;
  responded_at?: string | null;
}

export interface ResolveInput {
  absence?: AbsenceReasonFields | null;
  rsvp?: RsvpReasonFields | null;
  /** The student's live away windows. Only the one covering `classDate` counts. */
  awayWindows?: AwayWindow[] | null;
  /** The class's IST date, YYYY-MM-DD. Needed to test the away windows. */
  classDate?: string | null;
}

function clean(note: string | null | undefined): string | null {
  const t = note?.trim();
  return t ? t : null;
}

function codeOf(code: string | null | undefined): RsvpReasonCode {
  return isRsvpReasonCode(code) ? code : 'other';
}

function absenceSource(stored: string | null | undefined): ReasonSource {
  if (stored === 'parent') return 'parent';
  if (stored === 'teacher') return 'teacher';
  return 'after_class';
}

export function resolveAbsenceReason(input: ResolveInput): ResolvedReason | null {
  const { absence, rsvp, awayWindows, classDate } = input;

  if (awayWindows?.length && classDate) {
    const w = coveringWindow(awayWindows, classDate);
    if (w) {
      return {
        code: codeOf(w.reason_code),
        note: clean(w.reason_note),
        source: 'away',
        at: w.created_at ?? null,
        window: { id: w.id, starts_on: w.starts_on, ends_on: w.ends_on },
      };
    }
  }

  const absenceNote = clean(absence?.reason_note);
  if (absence && (absence.reason_code || absenceNote)) {
    return {
      code: codeOf(absence.reason_code),
      note: absenceNote,
      source: absenceSource(absence.reason_source),
      at: absence.reason_submitted_at ?? null,
      window: null,
    };
  }

  if (rsvp?.response === 'not_attending') {
    const note = clean(rsvp.reason);
    // A decline with neither a code nor a note still told us in advance that
    // they would not come. It reads as 'other' with no note rather than as
    // silence, matching `registerGroupOf`, which counts it as explained.
    return {
      code: codeOf(rsvp.reason_code),
      note,
      source: 'before_class',
      at: rsvp.responded_at ?? null,
      window: null,
      unspecified: !isRsvpReasonCode(rsvp.reason_code) && !note,
    };
  }

  return null;
}

/** "Told us before class", "Away 10 Sept to 20 Sept", ... for the reader's line. */
export function describeReasonSource(r: ResolvedReason): string {
  switch (r.source) {
    case 'before_class':
      return 'Told us before class';
    case 'away': {
      const w = r.window;
      if (!w) return 'Away';
      if (!w.ends_on) return `Away from ${formatDay(w.starts_on)}`;
      return `Away ${formatDay(w.starts_on)} to ${formatDay(w.ends_on)}`;
    }
    case 'parent':
      return 'Parent told us';
    case 'teacher':
      return 'Noted by a teacher';
    default:
      return 'Told us afterwards';
  }
}

/** The same thing from the student's side: "You told us before class". */
export function describeReasonSourceForStudent(r: ResolvedReason): string {
  switch (r.source) {
    case 'before_class':
      return 'You told us before class';
    case 'away':
      return describeReasonSource(r).replace(/^Away/, 'You were away');
    case 'parent':
      return 'Your parent told us';
    case 'teacher':
      return 'Your teacher noted';
    default:
      return 'You told us';
  }
}

/** The category chip text ("Exam clash"). Never the free text. */
export function reasonChip(r: ResolvedReason | null): string {
  if (!r) return 'No reason';
  if (r.unspecified) return 'Said they would miss it';
  return reasonShortLabel(r.code);
}

/**
 * The whole reason in one line for a roster row: "Exam clash · Away 10 Sep to
 * 20 Sep", "Unwell · Told us before class". Never "No reason given" for a
 * student who told us something, which is what the class panel used to print
 * for everyone on declared leave.
 */
export function reasonLine(r: ResolvedReason | null): string {
  if (!r) return 'No reason given';
  if (r.unspecified) return 'Told us before class they would miss it';
  return `${reasonShortLabel(r.code)} · ${describeReasonSource(r)}`;
}

/** Filter key for the teacher's reason filter: a code, or 'none'. */
export type ReasonFilterKey = RsvpReasonCode | 'none';

export function reasonFilterKey(r: ResolvedReason | null): ReasonFilterKey {
  return r ? r.code : 'none';
}

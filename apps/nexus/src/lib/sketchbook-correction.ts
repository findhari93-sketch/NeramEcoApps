/**
 * Correcting a sketch, and asking for another try.
 *
 * A sketch is never marked. A correction is the teacher drawing on it,
 * speaking over it and writing a line, and the only thing that can be owed
 * afterwards is another try. The rules live here, away from the screen and the
 * routes, so both read the same answer.
 *
 * Two facts shape everything below:
 *
 *   1. A sketch is stored `status = 'completed'` from the moment it is
 *      uploaded, and only `reviewed_at` ever moves. So an ask cannot be a
 *      status flip; it is `retry_asked_at` plus an optional `retry_due_on`.
 *   2. `nexus_inspiration_sync_submission` turns any submission carrying a
 *      `corrected_image_url` into a *visible* Inspiration reference item. A
 *      teacher's markup of a student's private sketch must never go near that
 *      column. The overlay goes to `reviewed_image_url`, which the sync's
 *      trigger does not even watch.
 */
import { isPracticeDrawing, type DrawingSourceFacts } from './drawing-source';

export type RetryStatus = 'none' | 'open' | 'overdue' | 'answered';

export interface RetryFacts {
  retry_asked_at: string | null;
  retry_due_on: string | null;
  /** A later attempt on the same thread is the only thing that answers an ask. */
  hasLaterAttempt: boolean;
}

export function retryStatus(facts: RetryFacts, today: string): RetryStatus {
  if (!facts.retry_asked_at) return 'none';
  if (facts.hasLaterAttempt) return 'answered';
  // No date means no deadline, so it can never fall behind.
  if (facts.retry_due_on && facts.retry_due_on < today) return 'overdue';
  return 'open';
}

const DAY = { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' } as const;

function dayName(date: string): string {
  // A plain date, read at noon IST so no timezone can shift it to the day before.
  // en-IN renders "Friday, 25 September"; the comma earns nothing in a sentence.
  return new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', DAY).replace(',', '');
}

/** What the student reads. Never a bare date, and never a scolding. */
export function retryLine(dueOn: string | null, today: string): string {
  if (!dueOn) return 'Try this one again when you can';
  if (dueOn < today) return `This was due ${dayName(dueOn)}`;
  return `Try this again by ${dayName(dueOn)}`;
}

export interface CorrectionInput {
  note: string | null;
  /** The flattened markup, already uploaded. */
  overlayUrl: string | null;
  now: string;
}

/**
 * Exactly what a correction writes to `drawing_submissions`, and nothing else.
 *
 * Built as an object rather than written inline at the route so a test can
 * assert what is absent: no grade, no status change, and above all no
 * `corrected_image_url`.
 */
export function correctionUpdate(input: CorrectionInput): Record<string, unknown> {
  const update: Record<string, unknown> = { reviewed_at: input.now };
  const note = (input.note ?? '').trim();
  if (note) update.tutor_feedback = note;
  if (input.overlayUrl) update.reviewed_image_url = input.overlayUrl;
  return update;
}

export type CorrectDecision = { ok: true } | { ok: false; reason: string };

/**
 * Only practice drawings are corrected here. An assignment or test drawing is
 * owed work and is marked on the review screen, which has the rubric this
 * screen deliberately does not.
 */
export function canCorrect(row: DrawingSourceFacts, studentIsAlumni: boolean): CorrectDecision {
  if (!isPracticeDrawing(row)) {
    return { ok: false, reason: 'This drawing is marked on the review screen, not here.' };
  }
  if (studentIsAlumni) {
    return { ok: false, reason: 'This student has graduated and can no longer sign in to read it. Their drawings stay in Inspiration.' };
  }
  return { ok: true };
}

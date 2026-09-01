/**
 * Whether a student may sit a test yet, given the classes it covers.
 *
 * A test set after a lecture assumes the lecture happened. A student who was
 * absent and has not caught up would be sitting a paper on material they have
 * not met, and the score would measure the gap rather than the student. So the
 * door stays shut until the catch-up behind it is done, and the refusal names
 * exactly which classes to finish.
 *
 * WHY THIS IS NOT `bucket === 'excused_pending_catchup'`
 *
 * That looks like the same question and is not. exam-eligibility-roster.ts
 * deliberately parks MISSING EVIDENCE in that bucket: a covered class with no
 * attendance row and no absence row lands there so the roster never DEMANDS a
 * test from a student it cannot vouch for. Absent evidence resolving to "not
 * required" is the safe answer to "who must sit this".
 *
 * Reusing it to answer "who MAY sit this" inverts that safety. The same missing
 * row would then mean "refused", so an attendance sync that ran late would lock
 * a student who was present out of their own test, and the failure would look
 * like their fault rather than the pipeline's.
 *
 * So this gate blocks only on POSITIVE evidence: an absence row that is on the
 * record and genuinely not caught up. Every uncertainty opens the door.
 *
 * PURE. The caller does the I/O.
 */

export interface GateClassEvidence {
  scheduled_class_id: string;
  title: string | null;
  scheduled_date: string;
  /** null means no attendance row was found at all, which is a data gap. */
  attended: boolean | null;
  absence: { kind: string; caught_up_at: string | null; excused_at: string | null } | null;
}

export interface CatchupGateDecision {
  blocked: boolean;
  /** The classes standing in the way, oldest first. Empty when not blocked. */
  outstanding: Array<{ id: string; title: string | null; date: string }>;
}

/**
 * A class blocks this test when the student has an absence on record for it
 * that is neither caught up nor excused.
 *
 * THE ABSENCE ROW IS THE EVIDENCE, NOT `attended === false`.
 *
 * This was written the other way round first, and it was inert. nexus_attendance
 * stores only presence: on production all 387 rows carry attended = true, and
 * an absent student simply has no row at all. So `attended === false` never
 * fires, and a gate keyed on it would have shipped looking correct and
 * refusing nobody, which is the same silent-success failure as the reopen bug
 * this stage exists to fix.
 *
 * `attended === true` is still honoured as an override: if attendance says the
 * student was there, a stale absence row must not shut them out.
 *
 * All three absence kinds count. `no_show`, `late_joiner` and `opted_out` each
 * open a catch-up window (catchup.ts:109 gives opted_out its own length), so
 * each one leaves material the test is about to ask questions on. An excused
 * absence is a teacher saying the student owes nothing, and holding the test
 * shut after that would overrule them.
 */
function blocks(e: GateClassEvidence): boolean {
  if (e.attended === true) return false;
  if (!e.absence) return false;
  if (e.absence.excused_at) return false;
  return !e.absence.caught_up_at;
}

export function decideCatchupGate(evidence: GateClassEvidence[]): CatchupGateDecision {
  const outstanding = (evidence || [])
    .filter(blocks)
    .map((e) => ({ id: e.scheduled_class_id, title: e.title, date: e.scheduled_date }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { blocked: outstanding.length > 0, outstanding };
}

/**
 * What the student is told, naming the classes rather than counting them.
 *
 * "Finish 2 catch-up classes" sends a student hunting through a backlog for
 * which two. The whole value of the refusal is that it ends with an action.
 */
export function describeCatchupGate(decision: CatchupGateDecision): string {
  const names = decision.outstanding.map((o) => o.title).filter((t): t is string => Boolean(t));
  const n = decision.outstanding.length;

  if (n === 0) return '';
  if (names.length === 0) {
    return `Finish your ${n} pending catch-up ${n === 1 ? 'class' : 'classes'} first, then this test opens for you.`;
  }
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Finish your catch-up for ${list} first, then this test opens for you.`;
}

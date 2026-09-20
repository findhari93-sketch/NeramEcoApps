/**
 * What one test card says, and what its one button does.
 *
 * ONE CARD, ONE ANSWER. A student looking at a test is asking a single
 * question, "can I do this now, and if not what do I do instead", and until
 * this file existed the card answered it in four places at once: a chip in the
 * corner, a yellow banner in the middle, a progress bar, and a button label.
 * Those four were derived independently, so they could and did contradict each
 * other. The worst pair shipped to 26 students: a banner promising the test
 * would open once they caught up, sitting directly above a disabled button
 * saying "Closed", on a test their teacher had already opened for them.
 *
 * Two rules follow from that, and both are load bearing.
 *
 * 1. THE SERVER DECIDES. The client re-derives nothing. Comparing dates in the
 *    browser also meant comparing PostgREST timestamp strings through
 *    `new Date(...)`, which parses differently across browsers, so the same card
 *    could disable itself on one phone and not another.
 *
 * 2. NO DISABLED BUTTONS. A greyed-out control carrying a refusal is a dead
 *    end: it states a problem and offers no way out. Where there is genuinely
 *    nothing to press, `action.kind` is 'none' and the card renders NO button,
 *    which is honest. Where there is anything at all a student can do, the
 *    button does that thing instead.
 *
 * PURE. No clock, no database, no React. `now` is injected so the whole table
 * can be tested, including a year from now.
 */

import { describeCatchupGate, type CatchupGateDecision } from './catchup-test-gate';
import { testReasonShortLabel } from './test-reasons';

export type StudentTestCardState =
  /** Sit it now, inside the window everyone shares. */
  | 'open'
  /** Sit it now, inside a window opened for this student alone. */
  | 'reopened'
  /** Opens later. Nothing to do yet, and nothing to press. */
  | 'upcoming'
  /** Catch-up is standing in the way. */
  | 'locked'
  /** They asked for a sitting and nobody has answered. */
  | 'awaiting_teacher'
  /** The door shut and they never sat it. Class tests and practice. */
  | 'closed'
  /** The exam door shut and they were absent. Different fact, different word. */
  | 'missed'
  /** Sat it. */
  | 'done';

export type StudentTestAction =
  | { kind: 'start'; label: string }
  | { kind: 'retry'; label: string }
  | { kind: 'review'; label: string }
  | { kind: 'catch_up'; label: string; href: string }
  | { kind: 'reschedule'; label: string }
  | { kind: 'ask_teacher'; label: string }
  /** Renders no button at all. Never a disabled one. */
  | { kind: 'none' };

export type StudentTestTone = 'urgent' | 'attention' | 'neutral' | 'positive';

export interface StudentTestCard {
  state: StudentTestCardState;
  /** One sentence, student voice. The card's whole answer. Always present. */
  reason: string;
  /** Exactly one, and never disabled. */
  action: StudentTestAction;
  tone: StudentTestTone;
  /** Which window this student is actually inside. */
  window: {
    opens_at: string | null;
    closes_at: string | null;
    source: 'shared' | 'makeup' | 'reopen';
  };
  /** Per door. Null limit means unlimited. */
  attempts_here: number;
  attempts_left: number | null;
  /** The number worth showing. Null when they have not sat it through this door. */
  score_percentage: number | null;
  /** How to label score_percentage. An exam is sat once, so it has a score, not a best. */
  score_label: 'Your score' | 'Best' | null;
  /** Only when they have practised the SAME PAPER through a different door. */
  practice_elsewhere: { attempts: number; best_percentage: number | null } | null;
  /**
   * "Tell your teacher why", offered BESIDE the one action, never instead of it.
   * Null when the question does not apply: the test was not theirs to owe, or
   * they sat it, or the door is still open. `given` is what they already said.
   */
  why: { given: { code: string; short_label: string } | null } | null;
}

/** What the resolver needs. A subset of the overview route's item shape. */
export interface StudentTestFacts {
  available_from?: string | null;
  available_until?: string | null;
  due_at?: string | null;
  attempt_limit?: number | null;
  attempts?: number;
  best_percentage?: number | null;
  last_submitted_at?: string | null;
  passing_pct?: number | null;
  is_exam?: boolean;
  is_makeup?: boolean;
  is_reopen?: boolean;
  access_state?: 'none' | 'pending' | 'granted';
  /**
   * True when sitting this now puts the student in the exam's second rank list.
   *
   * Stated on the card BEFORE they sit. Learning afterwards that you were
   * ranked in a separate list, having been given no chance to weigh it, is the
   * kind of surprise a student is right to resent.
   *
   * True for a make-up window as well as for a teacher's reopen. What decides
   * the sitting is WHEN the window opens, never which door it was, so a
   * make-up scheduled after the shared close is a second sitting too.
   */
  ranks_in_second_sitting?: boolean;
  /** Which sitting their published result was ranked in. Null until results are out. */
  result_sitting?: 'main' | 'second' | null;
  results_state?: 'unpublished' | 'provisional' | 'final';
  exam_result?: {
    rank: number | null;
    total_ranked: number;
    percentage: number | null;
    is_provisional: boolean;
    absent: boolean;
  } | null;
  eligibility_bucket?: string | null;
  eligibility_auto_bucket?: string | null;
  catchup_gate?: CatchupGateDecision | null;
  practice_elsewhere?: { attempts: number; best_percentage: number | null } | null;
  placement_id?: string | null;
  /** Which kind of door this is (exam, class_test, classroom_assignment, student_practice). */
  placement_context?: string | null;
  /** False only on a class test the teacher marked optional. */
  required?: boolean | null;
  /** What the student already told their teacher about not sitting it. */
  skip_reason?: { reason_code: string; reason_note: string | null; updated_at: string | null } | null;
}

const IST = 'Asia/Kolkata';

/** "Fri 12 Sep, 9:00 pm". Named days because a student plans in days, not dates. */
function at(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST });
  const time = d
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST })
    .toLowerCase();
  return `${day}, ${time}`;
}

/** "Mon 18 Aug". For something already over, where the minute does not matter. */
function on(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST });
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

const pct = (n: number | null | undefined): string => (n == null ? '' : `${Math.round(n)}%`);

/**
 * The clause naming a finished result's sitting, appended to a "You sat this..."
 * sentence. ONE function so the two `done` returns that report a completed
 * sitting cannot drift apart, which is exactly the failure this task exists to
 * prevent: a future wording change applied at one call site and missed at the
 * other.
 */
const resultSittingNote = (t: StudentTestFacts): string =>
  t.result_sitting === 'second' ? ' You were ranked in the second sitting.' : '';

/**
 * The clause warning a student, BEFORE they sit, that this door puts them in
 * the second sitting.
 *
 * ONE function for the same reason as resultSittingNote, and it earns it: the
 * warning first shipped inside the `reopened` branch alone, so a student
 * holding a make-up window scheduled after exam day flowed through the make-up
 * branches and was told nothing, while their paper was ranked `second` all the
 * same. Every branch that can render a personal window calls this.
 *
 * Empty unless ranks_in_second_sitting is true, which the server only sets for
 * a window that opens after the exam's shared close, so appending it to the
 * shared-window branches costs nothing and cannot say anything false.
 */
const preSittingNote = (t: StudentTestFacts): string =>
  t.ranks_in_second_sitting
    ? ' You will be ranked with the second sitting, because exam day has passed.'
    : '';

/** Doors a teacher sets for the class, as opposed to a practice pool nobody owes. */
const OWED_CONTEXTS = new Set(['class_test', 'classroom_assignment']);

/** Buckets that mean the eligibility engine did not require this student to sit it. */
const EXCUSED_BUCKETS = new Set(['excused_new_joiner', 'excused_pending_catchup', 'teacher_override_excused']);

/**
 * States where the door shut on a paper they have not sat, or where a door
 * reopened for them is still unused. Nothing else is a missed test: an open
 * window is still time, and a done card has nothing to explain.
 */
const WHY_STATES = new Set<StudentTestCardState>(['missed', 'closed', 'reopened', 'awaiting_teacher']);

/**
 * Whether to ask "why did you not sit it", and what they already answered.
 *
 * Owed means an exam the eligibility engine did not excuse them from, or a class
 * test or class assignment that was not marked optional. A reason is not an
 * excuse and changes no deadline (see api/student/tests/reasons), so offering
 * it can never let a student out of work; it only tells the teacher.
 */
function resolveWhy(t: StudentTestFacts, state: StudentTestCardState): StudentTestCard['why'] {
  if ((t.attempts ?? 0) > 0 || !WHY_STATES.has(state)) return null;
  const owed = t.is_exam
    ? !EXCUSED_BUCKETS.has(String(t.eligibility_bucket ?? ''))
    : OWED_CONTEXTS.has(String(t.placement_context ?? '')) && t.required !== false;
  if (!owed) return null;
  const code = t.skip_reason?.reason_code;
  return { given: code ? { code, short_label: testReasonShortLabel(code) } : null };
}

/**
 * The card after a student has just told their teacher why, without asking the
 * server to resolve it again. Only a card that offered the question changes.
 */
export function markWhyGiven(card: StudentTestCard, code: string): StudentTestCard {
  if (!card.why) return card;
  return { ...card, why: { given: { code, short_label: testReasonShortLabel(code) } } };
}

export function resolveStudentTestCard(t: StudentTestFacts, now: number): StudentTestCard {
  const core = resolveCardCore(t, now);
  return { ...core, why: resolveWhy(t, core.state) };
}

function resolveCardCore(t: StudentTestFacts, now: number): Omit<StudentTestCard, 'why'> {
  const attempts = t.attempts ?? 0;
  const limit = t.attempt_limit && t.attempt_limit > 0 ? t.attempt_limit : null;
  const attemptsLeft = limit == null ? null : Math.max(0, limit - attempts);
  const opens = ms(t.available_from);
  const closes = ms(t.available_until);
  const due = ms(t.due_at);
  const sat = attempts > 0;

  const windowSource: StudentTestCard['window']['source'] = t.is_reopen
    ? 'reopen'
    : t.is_makeup
      ? 'makeup'
      : 'shared';

  const base = {
    window: { opens_at: t.available_from ?? null, closes_at: t.available_until ?? null, source: windowSource },
    attempts_here: attempts,
    attempts_left: attemptsLeft,
    practice_elsewhere: t.practice_elsewhere ?? null,
  };

  // An exam is sat once, so its number is a score. Everything else can be
  // retaken, so its number is a best. Calling an exam's number "Best" was the
  // tell that it had come from somewhere else entirely.
  const score = sat ? (t.best_percentage ?? null) : null;
  const scored = {
    score_percentage: score,
    score_label: score == null ? null : t.is_exam ? ('Your score' as const) : ('Best' as const),
  };

  const card = (
    state: StudentTestCardState,
    reason: string,
    action: StudentTestAction,
    tone: StudentTestTone,
  ): Omit<StudentTestCard, 'why'> => ({ state, reason, action, tone, ...base, ...scored });

  const untilPhrase = closes != null ? ` You have until ${at(t.available_until)}.` : '';

  /* 1. A window opened for this student alone beats everything below it.
   *
   *    Including the catch-up gate, deliberately, and in the same order the
   *    attempt route uses: a teacher who opened the door has already answered
   *    the question the gate asks. Checking the gate first would refuse the
   *    student a human had just let in, which is this bug in reverse. */
  if (t.is_reopen && (closes == null || closes > now) && (opens == null || opens <= now)) {
    if (sat && attemptsLeft === 0) {
      return card('done', `You sat this on ${on(t.last_submitted_at)}.${resultSittingNote(t)}`, { kind: 'review', label: 'See your answers' }, 'positive');
    }
    return card(
      'reopened',
      `Your teacher opened this for you.${untilPhrase}${preSittingNote(t)}`,
      { kind: sat ? 'retry' : 'start', label: sat ? 'Try again' : 'Start the test' },
      'attention',
    );
  }

  /* 2. Not open yet. Nothing to press, so no button.
   *
   *    A make-up scheduled after exam day says so here, days before the door
   *    opens, which is the earliest a student can be told and the only point
   *    at which the warning can still change what they do about it. */
  if (opens != null && opens > now) {
    const makeup = t.is_makeup ? 'Your make-up sitting opens' : 'Opens';
    return card(
      'upcoming',
      `${makeup} ${at(t.available_from)}.${preSittingNote(t)}`,
      { kind: 'none' },
      'neutral',
    );
  }

  /* 3. Catch-up is in the way, and they have not sat it.
   *
   *    Said here, days ahead, and not only at the door. The attempt route
   *    enforces the same rule, but a refusal that first appears when a student
   *    presses Start on a timed exam costs them the sitting: the window is
   *    fixed and does not pause while they go and catch up.
   *
   *    The sentence is describeCatchupGate's, verbatim, so the card and the
   *    server's 403 can never word the same rule two ways. */
  if (t.catchup_gate?.blocked && !sat) {
    return card(
      'locked',
      describeCatchupGate(t.catchup_gate),
      { kind: 'catch_up', label: 'Go to my catch-up', href: '/student/catch-up' },
      'attention',
    );
  }

  /* 4. Excused because they joined after the class this covers.
   *
   *    The one excused reason that needs no teacher, so it gets a door rather
   *    than an explanation. Nothing else on the card says this test is even
   *    theirs to sit until they have picked a date for it. */
  if (t.is_exam && !sat && !t.exam_result && t.eligibility_auto_bucket === 'excused_new_joiner') {
    return card(
      'missed',
      'You joined after this was taught, so nobody expected you to sit it. Pick a date that suits you.',
      { kind: 'reschedule', label: 'Pick your make-up date' },
      'neutral',
    );
  }

  /* 5. Sat it. */
  if (sat) {
    const r = t.exam_result;
    if (r?.absent) {
      return card('done', 'You were marked absent for this one.', { kind: 'ask_teacher', label: 'Ask my teacher' }, 'neutral');
    }
    const when = t.last_submitted_at ? ` on ${on(t.last_submitted_at)}` : '';
    if (t.is_exam) {
      // The sitting is named on EVERY finished return, not only the final one.
      // Which list you were ranked in is a fact about the paper you sat, true
      // from the moment you submitted it, and a student who saw it named only
      // once their drawings came back would reasonably read it as a change.
      if (r?.is_provisional) {
        return card(
          'done',
          `You sat this${when}.${resultSittingNote(t)} Some drawings are still being marked, so this can change.`,
          { kind: 'review', label: 'See your answers' },
          'neutral',
        );
      }
      if (!r && t.results_state === 'unpublished') {
        return card(
          'done',
          `You sat this${when}.${resultSittingNote(t)} Your result is not out yet.`,
          { kind: 'review', label: 'See your answers' },
          'neutral',
        );
      }
      return card('done', `You sat this${when}.${resultSittingNote(t)}`, { kind: 'review', label: 'See your answers' }, 'positive');
    }
    // Not an exam, so it can be retaken if the door and the limit both allow.
    const shut = closes != null && closes < now;
    if (attemptsLeft === 0) {
      const best = score == null ? '' : ` Your best is ${pct(score)}.`;
      const many = attempts === 2 ? 'both your attempts' : `all ${attempts} of your attempts`;
      return card('done', `You have used ${many} on this one.${best}`, { kind: 'review', label: 'See your answers' }, 'neutral');
    }
    if (shut) {
      const best = score == null ? '' : ` Your best is ${pct(score)}.`;
      return card('done', `This closed on ${on(t.available_until)}.${best}`, { kind: 'review', label: 'See your answers' }, 'neutral');
    }
    const passed = t.passing_pct != null && score != null && score >= t.passing_pct;
    const left = attemptsLeft == null ? '' : ` You have ${attemptsLeft} more attempt${attemptsLeft === 1 ? '' : 's'}.`;
    return card(
      'done',
      passed
        ? `Passed. Your best is ${pct(score)}, and the bar is ${t.passing_pct}%.${left}`
        : `Your best so far is ${pct(score)}.${left}`,
      { kind: 'retry', label: 'Try again' },
      passed ? 'positive' : 'attention',
    );
  }

  /* 6. Never sat, and the limit is already spent.
   *
   *    Only reachable through a teacher's credit or a reset. It is still not a
   *    dead end: the answer is to ask. */
  if (attemptsLeft === 0) {
    return card(
      'closed',
      'You have no attempts left on this one. You can ask your teacher to open it again.',
      { kind: 'ask_teacher', label: 'Ask my teacher' },
      'neutral',
    );
  }

  /* 7. The door is open. */
  if (closes == null || closes >= now) {
    // A class test past its due date is LATE, not shut. Saying "closed" on a
    // paper a student can still finish is the one word that stops them.
    if (due != null && due < now && !t.is_exam) {
      return card(
        'open',
        `This was due on ${on(t.due_at)}. It is late, but you can still finish it.`,
        { kind: 'start', label: 'Finish it now' },
        'urgent',
      );
    }
    const makeup = t.is_makeup ? 'Your make-up sitting is open.' : 'Open now.';
    return card(
      'open',
      `${makeup}${untilPhrase}${preSittingNote(t)}`,
      { kind: 'start', label: 'Start the test' },
      closes != null ? 'urgent' : 'neutral',
    );
  }

  /* 8. Shut, and they asked. */
  if (t.access_state === 'pending') {
    return card(
      'awaiting_teacher',
      'You asked for another sitting. Your teacher has your request.',
      { kind: 'none' },
      'neutral',
    );
  }

  /* 9. Shut. An exam they were absent for reads differently from a link that
   *    expired: "closed" invites them to report an oversight, "you did not sit
   *    this" is what actually happened and what the roster already records. */
  if (t.is_exam) {
    return card(
      'missed',
      `You did not sit this one. It closed on ${on(t.available_until)}.`,
      { kind: 'ask_teacher', label: 'Ask my teacher for a sitting' },
      'neutral',
    );
  }
  return card(
    'closed',
    `This closed on ${on(t.available_until)}. You can ask your teacher to open it for you.`,
    { kind: 'ask_teacher', label: 'Ask my teacher' },
    'neutral',
  );
}

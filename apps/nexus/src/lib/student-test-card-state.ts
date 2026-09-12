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

export function resolveStudentTestCard(t: StudentTestFacts, now: number): StudentTestCard {
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
  ): StudentTestCard => ({ state, reason, action, tone, ...base, ...scored });

  const untilPhrase = closes != null ? ` You have until ${at(t.available_until)}.` : '';

  /* 1. A window opened for this student alone beats everything below it.
   *
   *    Including the catch-up gate, deliberately, and in the same order the
   *    attempt route uses: a teacher who opened the door has already answered
   *    the question the gate asks. Checking the gate first would refuse the
   *    student a human had just let in, which is this bug in reverse. */
  if (t.is_reopen && (closes == null || closes > now) && (opens == null || opens <= now)) {
    if (sat && attemptsLeft === 0) {
      return card('done', `You sat this on ${on(t.last_submitted_at)}.`, { kind: 'review', label: 'See your answers' }, 'positive');
    }
    return card(
      'reopened',
      `Your teacher opened this for you.${untilPhrase}`,
      { kind: sat ? 'retry' : 'start', label: sat ? 'Try again' : 'Start the test' },
      'attention',
    );
  }

  /* 2. Not open yet. Nothing to press, so no button. */
  if (opens != null && opens > now) {
    const makeup = t.is_makeup ? 'Your make-up sitting opens' : 'Opens';
    return card('upcoming', `${makeup} ${at(t.available_from)}.`, { kind: 'none' }, 'neutral');
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
      if (r?.is_provisional) {
        return card(
          'done',
          `You sat this${when}. Some drawings are still being marked, so this can change.`,
          { kind: 'review', label: 'See your answers' },
          'neutral',
        );
      }
      if (!r && t.results_state === 'unpublished') {
        return card(
          'done',
          `You sat this${when}. Your result is not out yet.`,
          { kind: 'review', label: 'See your answers' },
          'neutral',
        );
      }
      return card('done', `You sat this${when}.`, { kind: 'review', label: 'See your answers' }, 'positive');
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
    return card('open', `${makeup}${untilPhrase}`, { kind: 'start', label: 'Start the test' }, closes != null ? 'urgent' : 'neutral');
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

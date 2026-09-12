import { describe, expect, it } from 'vitest';
import {
  resolveStudentTestCard,
  type StudentTestCardState,
  type StudentTestFacts,
} from './student-test-card-state';

/**
 * The card's whole contract.
 *
 * Three of these are invariants rather than examples, and they are the point of
 * the file: the banner and the button always agree, no state ever produces a
 * dead end, and a reopened student is never told the test is closed. Each one
 * failed in production before this resolver existed.
 */

const NOW = Date.parse('2026-09-12T12:00:00Z');
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const past = (d: number) => new Date(NOW - d).toISOString();
const future = (d: number) => new Date(NOW + d).toISOString();

const test = (over: StudentTestFacts = {}): StudentTestFacts => ({
  attempts: 0,
  attempt_limit: null,
  ...over,
});

const resolve = (over: StudentTestFacts = {}) => resolveStudentTestCard(test(over), NOW);

const gate = (title: string | null = 'Islamic Architecture') => ({
  blocked: true,
  outstanding: [{ id: 'c1', title, date: '2026-08-14' }],
});

describe('resolveStudentTestCard', () => {
  describe('the window', () => {
    it('is open with no window at all, which is every paper a student built themselves', () => {
      const c = resolve();
      expect(c.state).toBe('open');
      expect(c.action).toEqual({ kind: 'start', label: 'Start the test' });
    });

    it('says when it closes, so a student can plan the evening', () => {
      const c = resolve({ available_until: future(2 * DAY) });
      expect(c.state).toBe('open');
      expect(c.reason).toContain('Open now.');
      expect(c.reason).toContain('You have until Mon, 14 Sep');
    });

    it('offers nothing to press before it opens, rather than a button that refuses', () => {
      const c = resolve({ available_from: future(DAY) });
      expect(c.state).toBe('upcoming');
      expect(c.action.kind).toBe('none');
      expect(c.reason).toContain('Opens');
    });

    it('names a make-up sitting as theirs rather than as the shared exam', () => {
      const c = resolve({ available_from: future(DAY), is_makeup: true });
      expect(c.reason).toContain('Your make-up sitting opens');
      expect(c.window.source).toBe('makeup');
    });
  });

  /**
   * NXS-0125. A teacher opened the 18 Aug exam for 26 students. Every one of
   * them saw a disabled button reading "Closed".
   */
  describe('a reopened student', () => {
    const reopened: StudentTestFacts = {
      is_exam: true,
      is_reopen: true,
      access_state: 'granted',
      available_from: past(DAY),
      available_until: future(6 * DAY),
    };

    it('is never told the test is closed', () => {
      const c = resolve(reopened);
      expect(c.state).toBe('reopened');
      expect(c.reason).toBe('Your teacher opened this for you. You have until Fri, 18 Sept, 5:30 pm.');
      expect(c.action).toEqual({ kind: 'start', label: 'Start the test' });
      expect(c.window.source).toBe('reopen');
    });

    it('gets in even while catch-up is still outstanding, matching the attempt route', () => {
      // holdsGrant skips the gate server side. A teacher who opened the door has
      // already answered the question the gate asks, and asking it again here
      // would refuse the student a human just let in.
      const c = resolve({ ...reopened, catchup_gate: gate() });
      expect(c.state).toBe('reopened');
      expect(c.action.kind).toBe('start');
    });

    it('falls back to the real state once their window has run out too', () => {
      const c = resolve({ ...reopened, available_until: past(HOUR) });
      expect(c.state).toBe('missed');
      expect(c.action.kind).toBe('ask_teacher');
    });
  });

  describe('catch-up', () => {
    it('sends them to the catch-up they must finish, naming the class', () => {
      const c = resolve({ is_exam: true, catchup_gate: gate() });
      expect(c.state).toBe('locked');
      expect(c.reason).toBe(
        'Finish your catch-up for Islamic Architecture first, then this test opens for you.',
      );
      expect(c.action).toEqual({ kind: 'catch_up', label: 'Go to my catch-up', href: '/student/catch-up' });
    });

    it('counts the classes when none of them has a title', () => {
      const c = resolve({ catchup_gate: gate(null) });
      expect(c.reason).toContain('1 pending catch-up class');
    });

    it('stops mattering once the test has been sat', () => {
      const c = resolve({ catchup_gate: gate(), attempts: 1, best_percentage: 80 });
      expect(c.state).toBe('done');
    });
  });

  describe('a new joiner', () => {
    it('is told nobody expected them to sit it, and gets to pick a date', () => {
      const c = resolve({ is_exam: true, eligibility_auto_bucket: 'excused_new_joiner', available_until: past(DAY) });
      expect(c.state).toBe('missed');
      expect(c.action).toEqual({ kind: 'reschedule', label: 'Pick your make-up date' });
      expect(c.reason).toContain('nobody expected you to sit it');
    });
  });

  describe('attempts, counted per door', () => {
    /**
     * Hari Heera's row. Two attempts on the paper, both through the Study
     * Materials door, none through the exam. The card told him he was out of
     * attempts on an exam he had never sat, and showed 76% (a practice score)
     * as his exam best.
     */
    it('does not spend an exam attempt on a chapter practised elsewhere', () => {
      const c = resolve({
        is_exam: true,
        attempt_limit: 1,
        attempts: 0,
        available_until: future(DAY),
        practice_elsewhere: { attempts: 2, best_percentage: 76 },
      });
      expect(c.state).toBe('open');
      expect(c.action.kind).toBe('start');
      expect(c.attempts_left).toBe(1);
      // Kept, but never as the headline. It is not their exam score.
      expect(c.score_percentage).toBeNull();
      expect(c.practice_elsewhere).toEqual({ attempts: 2, best_percentage: 76 });
    });

    it('calls an exam number a score and a practice number a best', () => {
      const exam = resolve({ is_exam: true, attempts: 1, best_percentage: 82, results_state: 'final' });
      expect(exam.score_label).toBe('Your score');

      const practice = resolve({ attempts: 3, best_percentage: 82 });
      expect(practice.score_label).toBe('Best');
    });

    it('reports attempts left rather than a bare refusal when the limit is spent', () => {
      const c = resolve({ attempts: 2, attempt_limit: 2, best_percentage: 82 });
      expect(c.state).toBe('done');
      expect(c.attempts_left).toBe(0);
      expect(c.reason).toBe('You have used both your attempts on this one. Your best is 82%.');
      expect(c.action.kind).toBe('review');
    });

    it('treats a null limit as unlimited', () => {
      expect(resolve({ attempts: 9 }).attempts_left).toBeNull();
    });
  });

  describe('results', () => {
    it('says the result is not out rather than leaving the card silent', () => {
      const c = resolve({ is_exam: true, attempts: 1, results_state: 'unpublished', last_submitted_at: past(3 * DAY) });
      expect(c.reason).toContain('Your result is not out yet.');
    });

    it('warns that a provisional result can still change', () => {
      const c = resolve({
        is_exam: true,
        attempts: 1,
        results_state: 'provisional',
        exam_result: { rank: 3, total_ranked: 42, percentage: 76, is_provisional: true, absent: false },
      });
      expect(c.reason).toContain('still being marked');
    });

    it('gives an absent student somebody to ask rather than a full stop', () => {
      const c = resolve({
        is_exam: true,
        attempts: 1,
        exam_result: { rank: null, total_ranked: 42, percentage: null, is_provisional: false, absent: true },
      });
      expect(c.reason).toBe('You were marked absent for this one.');
      expect(c.action.kind).toBe('ask_teacher');
    });
  });

  describe('a shut door', () => {
    it('tells an exam student they did not sit it, not that a link expired', () => {
      const c = resolve({ is_exam: true, available_until: past(3 * DAY) });
      expect(c.state).toBe('missed');
      expect(c.reason).toContain('You did not sit this one.');
      expect(c.action.kind).toBe('ask_teacher');
    });

    it('tells a class-test student how to get back in', () => {
      const c = resolve({ available_until: past(3 * DAY) });
      expect(c.state).toBe('closed');
      expect(c.reason).toContain('ask your teacher to open it for you');
    });

    it('says nothing more is needed when they have already asked', () => {
      const c = resolve({ available_until: past(3 * DAY), access_state: 'pending' });
      expect(c.state).toBe('awaiting_teacher');
      expect(c.action.kind).toBe('none');
      expect(c.reason).toContain('Your teacher has your request.');
    });

    it('calls an overdue class test late rather than closed, because it can still be finished', () => {
      const c = resolve({ due_at: past(4 * DAY) });
      expect(c.state).toBe('open');
      expect(c.tone).toBe('urgent');
      expect(c.reason).toContain('It is late, but you can still finish it.');
      expect(c.action).toEqual({ kind: 'start', label: 'Finish it now' });
    });
  });

  /* ─────────────────── invariants, not examples ─────────────────── */

  /**
   * Every combination that could plausibly reach a card. Small enough to
   * enumerate, which is the point: the failures below were all in a corner
   * nobody thought to write an example for.
   */
  const permutations: StudentTestFacts[] = [];
  for (const is_exam of [true, false]) {
    for (const available_from of [null, past(DAY), future(DAY)]) {
      for (const available_until of [null, past(DAY), future(DAY)]) {
        for (const attempts of [0, 1, 2]) {
          for (const attempt_limit of [null, 1, 2]) {
            for (const catchup_gate of [null, gate()]) {
              for (const access_state of ['none', 'pending', 'granted'] as const) {
                for (const is_reopen of [true, false]) {
                  permutations.push({
                    is_exam,
                    available_from,
                    available_until,
                    attempts,
                    attempt_limit,
                    catchup_gate,
                    access_state,
                    is_reopen,
                    best_percentage: attempts > 0 ? 70 : null,
                    last_submitted_at: attempts > 0 ? past(2 * DAY) : null,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  it('covers a wide surface, so the invariants below mean something', () => {
    expect(permutations.length).toBeGreaterThan(600);
  });

  it('never produces a dead end: every state either acts or shows no button', () => {
    // The rule this file exists for. A disabled control carrying a refusal
    // states a problem and offers no way out of it.
    const mayBeSilent: StudentTestCardState[] = ['upcoming', 'awaiting_teacher'];
    for (const p of permutations) {
      const c = resolveStudentTestCard(p, NOW);
      if (c.action.kind === 'none') {
        expect(mayBeSilent, JSON.stringify(p)).toContain(c.state);
      }
    }
  });

  it('never lets the explanation and the button disagree', () => {
    for (const p of permutations) {
      const c = resolveStudentTestCard(p, NOW);
      // Locked is the pair that shipped broken: a banner saying "finish your
      // catch-up to unlock this" above a button saying "Closed".
      if (c.state === 'locked') expect(c.action.kind, JSON.stringify(p)).toBe('catch_up');
      if (c.state === 'reopened') expect(['start', 'retry']).toContain(c.action.kind);
      if (c.state === 'open') expect(['start', 'retry']).toContain(c.action.kind);
    }
  });

  it('always gives a reason, and always a whole sentence', () => {
    for (const p of permutations) {
      const c = resolveStudentTestCard(p, NOW);
      expect(c.reason.length, JSON.stringify(p)).toBeGreaterThan(0);
      expect(c.reason.trim().endsWith('.'), c.reason).toBe(true);
    }
  });

  /** A CLAUDE.md rule that was previously enforced by review alone. */
  it('never writes an em dash or a double dash into anything a student reads', () => {
    for (const p of permutations) {
      const c = resolveStudentTestCard(p, NOW);
      const copy = [c.reason, 'label' in c.action ? c.action.label : ''].join(' ');
      expect(copy, JSON.stringify(p)).not.toMatch(/—|--|&mdash;/);
    }
  });

  /**
   * The card used to compare PostgREST timestamp strings in the browser, which
   * parses differently across browsers and made the same test appear open on a
   * laptop and closed on a phone.
   */
  it('depends on the injected clock and nothing else', () => {
    const facts = test({ available_until: future(DAY) });
    expect(resolveStudentTestCard(facts, NOW).state).toBe('open');
    expect(resolveStudentTestCard(facts, NOW + 365 * DAY).state).toBe('closed');
  });

  it('ignores an unparseable date rather than locking a student out', () => {
    const c = resolveStudentTestCard(test({ available_until: 'not a date' }), NOW);
    expect(c.state).toBe('open');
  });

  describe('the second sitting is announced before the student sits', () => {
    const NOW_TASK6 = Date.parse('2026-09-12T06:00:00.000Z');

    // A student who sits late and learns only afterwards that they were in a
    // separate list will feel cheated, and would be right.
    it('says so on a reopened exam that will be ranked in the second sitting', () => {
      const card = resolveStudentTestCard(
        {
          is_exam: true,
          is_reopen: true,
          access_state: 'granted',
          available_from: '2026-09-11T12:23:00.000Z',
          available_until: '2026-09-19T12:34:00.000Z',
          ranks_in_second_sitting: true,
        },
        NOW_TASK6,
      );
      expect(card.state).toBe('reopened');
      expect(card.reason).toContain('second sitting');
      expect(card.action.kind).toBe('start');
    });

    it('says nothing about sittings when the reopen is still inside exam day', () => {
      const card = resolveStudentTestCard(
        {
          is_exam: true,
          is_reopen: true,
          access_state: 'granted',
          available_until: '2026-09-19T12:34:00.000Z',
          ranks_in_second_sitting: false,
        },
        NOW_TASK6,
      );
      expect(card.state).toBe('reopened');
      expect(card.reason).not.toContain('second sitting');
    });

    it('uses no em dash or double dash in the second sitting sentence', () => {
      const card = resolveStudentTestCard(
        { is_exam: true, is_reopen: true, access_state: 'granted', available_until: '2026-09-19T12:34:00.000Z', ranks_in_second_sitting: true },
        NOW_TASK6,
      );
      expect(card.reason).not.toMatch(/—|--|&mdash;/);
    });
  });
});

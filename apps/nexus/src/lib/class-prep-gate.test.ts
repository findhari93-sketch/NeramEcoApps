import { describe, it, expect } from 'vitest';
import {
  decideClassPrepGate,
  prepBlockerCopy,
  prepTestPassed,
  PREP_GATE_LEAD_MINUTES,
  type ClassPrepGateInput,
} from './class-prep-gate';

const CLASS_START = '2026-08-20T19:00:00+05:30';
const START_MS = Date.parse(CLASS_START);

/** Inside the lead window: 19:00 class, so 17:00 is armed. */
const ARMED = START_MS - 120 * 60_000;

function input(over: Partial<ClassPrepGateInput> = {}): ClassPrepGateInput {
  return {
    flagEnabled: true,
    role: 'student',
    test: null,
    prework: { required: 0, submitted: 0 },
    reasonGiven: false,
    classStartIso: CLASS_START,
    nowMs: ARMED,
    ...over,
  };
}

describe('the door never closes on someone it should not', () => {
  it('is not gated at all when the flag is off, whatever else is outstanding', () => {
    const d = decideClassPrepGate(
      input({
        flagEnabled: false,
        test: { bestPct: 0, passingPct: 80, attempts: 0 },
        prework: { required: 3, submitted: 0 },
      }),
    );
    expect(d).toEqual({ gated: false, open: true, via: 'flag_off', blockers: [], readiness: null });
  });

  it('never gates a teacher, who has to reach their own class', () => {
    const d = decideClassPrepGate(
      input({ role: 'teacher', test: { bestPct: null, passingPct: 80, attempts: 0 } }),
    );
    expect(d.open).toBe(true);
    expect(d.gated).toBe(false);
  });

  it('never gates a teacher using View-as-Student', () => {
    const d = decideClassPrepGate(
      input({ impersonating: true, test: { bestPct: null, passingPct: 80, attempts: 0 } }),
    );
    expect(d.open).toBe(true);
  });

  it('never gates a cancelled class', () => {
    const d = decideClassPrepGate(
      input({ classStatus: 'cancelled', test: { bestPct: null, passingPct: 80, attempts: 0 } }),
    );
    expect(d.open).toBe(true);
    expect(d.gated).toBe(false);
  });

  it('leaves a class with no test and no prework completely alone', () => {
    // The overwhelmingly common case. Any change to this path is a regression
    // across every class in the system.
    const d = decideClassPrepGate(input());
    expect(d).toEqual({
      gated: false,
      open: true,
      via: 'not_required',
      blockers: [],
      readiness: null,
    });
  });

  it('reports readiness null, never 0, when nothing was asked', () => {
    // "Nothing was required" and "met none of the requirements" are different
    // sentences, and this number ends up in front of a parent.
    expect(decideClassPrepGate(input()).readiness).toBeNull();
    expect(decideClassPrepGate(input()).readiness).not.toBe(0);
  });

  it('shows no lock before the lead window opens', () => {
    const d = decideClassPrepGate(
      input({
        nowMs: START_MS - (PREP_GATE_LEAD_MINUTES + 1) * 60_000,
        test: { bestPct: null, passingPct: 80, attempts: 0 },
      }),
    );
    expect(d.via).toBe('not_yet_armed');
    expect(d.open).toBe(true);
    // Still gated: the class DOES have requirements, they are just not yet due.
    expect(d.gated).toBe(true);
  });

  it('arms exactly at the lead boundary', () => {
    const d = decideClassPrepGate(
      input({
        nowMs: START_MS - PREP_GATE_LEAD_MINUTES * 60_000,
        test: { bestPct: null, passingPct: 80, attempts: 0 },
      }),
    );
    expect(d.open).toBe(false);
  });

  it('opens the door on a reason and still reports every blocker', () => {
    // The escape hatch has to do both: the student gets to the teaching, the
    // teacher still learns what is outstanding.
    const d = decideClassPrepGate(
      input({
        reasonGiven: true,
        test: { bestPct: 20, passingPct: 80, attempts: 1 },
        prework: { required: 1, submitted: 0 },
      }),
    );
    expect(d.open).toBe(true);
    expect(d.via).toBe('reason');
    expect(d.blockers).toEqual(['test_not_passed', 'prework_missing']);
  });
});

describe('the pass rule agrees with the grader', () => {
  it('treats an exact hit on the bar as a pass', () => {
    // The grader is `percentage >= passingPct`. Anything stricter here locks out
    // a student the result screen just congratulated.
    expect(prepTestPassed(80, 80)).toBe(true);
    expect(decideClassPrepGate(input({ test: { bestPct: 80, passingPct: 80, attempts: 1 } })).open).toBe(true);
  });

  it('fails one hundredth below the bar', () => {
    // The grader rounds to two decimals, so 79.99 is a value it can produce.
    expect(prepTestPassed(79.99, 80)).toBe(false);
  });

  it('treats a null bar as passed once there is any attempt', () => {
    // Mirrors resolvePassingPct returning null, which the grader reads as passed.
    expect(prepTestPassed(12, null)).toBe(true);
    expect(prepTestPassed(null, null)).toBe(false);
  });

  it('blocks with no attempt at all', () => {
    const d = decideClassPrepGate(input({ test: { bestPct: null, passingPct: 70, attempts: 0 } }));
    expect(d.open).toBe(false);
    expect(d.blockers).toEqual(['test_not_passed']);
  });

  it('never lets attempt count substitute for passing', () => {
    const d = decideClassPrepGate(input({ test: { bestPct: 40, passingPct: 80, attempts: 5 } }));
    expect(d.open).toBe(false);
    expect(d.blockers).toContain('test_not_passed');
  });
});

describe('the prework rule', () => {
  it('clears when all of it is in', () => {
    expect(decideClassPrepGate(input({ prework: { required: 3, submitted: 3 } })).open).toBe(true);
  });

  it('blocks on a partial hand-in', () => {
    const d = decideClassPrepGate(input({ prework: { required: 3, submitted: 2 } }));
    expect(d.open).toBe(false);
    expect(d.blockers).toEqual(['prework_missing']);
  });

  it('does not count zero prework toward readiness', () => {
    const d = decideClassPrepGate(input({ test: { bestPct: 90, passingPct: 70, attempts: 1 } }));
    expect(d.readiness).toBe(1);
  });

  it('clears rather than throwing when the count is stale', () => {
    // A teacher unlinking an assignment after a student handed it in leaves
    // submitted > required. Nobody should be locked out by our own bookkeeping.
    const d = decideClassPrepGate(input({ prework: { required: 1, submitted: 3 } }));
    expect(d.open).toBe(true);
    expect(d.readiness).toBe(1);
  });
});

describe('ordering and copy', () => {
  it('asks for the test first, because it is the longer job', () => {
    const d = decideClassPrepGate(
      input({
        test: { bestPct: null, passingPct: 70, attempts: 0 },
        prework: { required: 1, submitted: 0 },
      }),
    );
    expect(d.blockers).toEqual(['test_not_passed', 'prework_missing']);
    expect(prepBlockerCopy(d)?.primaryAction).toBe('take_test');
  });

  it('reports partial readiness as a fraction', () => {
    const d = decideClassPrepGate(
      input({
        test: { bestPct: 90, passingPct: 70, attempts: 1 },
        prework: { required: 3, submitted: 0 },
      }),
    );
    // One of four things done: the test, and none of the three assignments.
    expect(d.readiness).toBeCloseTo(0.25);
  });

  it('refuses to produce blocked copy for an open door', () => {
    // No caller should be able to render a lock over a class they may join.
    expect(prepBlockerCopy(decideClassPrepGate(input()))).toBeNull();
    expect(
      prepBlockerCopy(
        decideClassPrepGate(
          input({ reasonGiven: true, prework: { required: 1, submitted: 0 } }),
        ),
      ),
    ).toBeNull();
  });

  it('names one thing when only one is outstanding', () => {
    const copy = prepBlockerCopy(
      decideClassPrepGate(input({ prework: { required: 1, submitted: 0 } })),
    );
    expect(copy?.title).toBe('One thing before you join');
    expect(copy?.lines).toEqual(['Hand in the pre-class work']);
    expect(copy?.primaryAction).toBe('do_prework');
  });
});

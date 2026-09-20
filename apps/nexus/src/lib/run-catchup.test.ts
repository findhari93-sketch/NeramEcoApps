import { describe, expect, it } from 'vitest';
import { buildRunCatchup, describeRunCatchup, type RunCatchup } from './run-catchup';
import type { EligibilityAbsenceFacts, EligibilityCoveredClass } from './exam-eligibility-roster';

const CLASS_A: EligibilityCoveredClass = {
  id: 'c1',
  title: 'Indian Architectural Heritage',
  scheduled_date: '2026-08-12',
};
const CLASS_B: EligibilityCoveredClass = {
  id: 'c2',
  title: 'Indo-Aryan Temple Architecture',
  scheduled_date: '2026-08-14',
};

const absence = (over: Partial<EligibilityAbsenceFacts> = {}): EligibilityAbsenceFacts => ({
  kind: 'no_show',
  caught_up_at: null,
  excused_at: null,
  ...over,
});

const build = (
  attendance: Record<string, Record<string, boolean>>,
  absences: Record<string, Record<string, EligibilityAbsenceFacts>>,
  coveredClasses: EligibilityCoveredClass[] = [CLASS_A, CLASS_B],
) =>
  buildRunCatchup({
    studentIds: ['s1'],
    coveredClasses,
    attendance: new Map(Object.entries(attendance).map(([k, v]) => [k, new Map(Object.entries(v))])),
    absences: new Map(Object.entries(absences).map(([k, v]) => [k, new Map(Object.entries(v))])),
  });

describe('buildRunCatchup', () => {
  it('reads a student present at every covered class as attended', () => {
    expect(build({ s1: { c1: true, c2: true } }, {})).toEqual({
      s1: { state: 'attended', outstanding: [] },
    });
  });

  it('reads an open absence as behind, and names the classes', () => {
    const out = build({ s1: { c2: true } }, { s1: { c1: absence() } });
    expect(out.s1.state).toBe('behind');
    expect(out.s1.outstanding).toEqual([
      { id: 'c1', title: 'Indian Architectural Heritage', date: '2026-08-12' },
    ]);
  });

  it('counts every open class, oldest first', () => {
    const out = build({}, { s1: { c2: absence(), c1: absence() } });
    expect(out.s1.outstanding.map((o) => o.id)).toEqual(['c1', 'c2']);
  });

  it('reads a cleared absence as caught up', () => {
    expect(build({}, { s1: { c1: absence({ caught_up_at: '2026-09-01T00:00:00Z' }) } }).s1).toEqual({
      state: 'caught_up',
      outstanding: [],
    });
  });

  it('treats an excused absence as caught up, like the gate does', () => {
    expect(build({}, { s1: { c1: absence({ excused_at: '2026-09-01T00:00:00Z' }) } }).s1.state).toBe(
      'caught_up',
    );
  });

  it('one open class outranks another that was cleared', () => {
    const out = build({}, { s1: { c1: absence({ caught_up_at: '2026-09-01T00:00:00Z' }), c2: absence() } });
    expect(out.s1.state).toBe('behind');
    expect(out.s1.outstanding.map((o) => o.id)).toEqual(['c2']);
  });

  it('calls a total lack of evidence unknown, never caught up', () => {
    // Four students on the 18 Aug exam look exactly like this. Saying "caught
    // up" about them would be a lie a teacher would act on.
    expect(build({}, {}).s1).toEqual({ state: 'unknown', outstanding: [] });
  });

  it('calls a partial attendance record unknown', () => {
    expect(build({ s1: { c1: true } }, {}).s1.state).toBe('unknown');
  });

  it('says nothing at all when the run covers no class', () => {
    expect(build({ s1: { c1: true } }, {}, [])).toEqual({});
  });

  it('gives every requested student an answer, present in the facts or not', () => {
    const out = buildRunCatchup({
      studentIds: ['s1', 's2'],
      coveredClasses: [CLASS_A],
      attendance: new Map(),
      absences: new Map(),
    });
    expect(Object.keys(out).sort()).toEqual(['s1', 's2']);
  });
});

describe('describeRunCatchup', () => {
  const state = (s: RunCatchup) => describeRunCatchup(s);

  it('counts the outstanding classes', () => {
    expect(state({ state: 'behind', outstanding: [{ id: 'c1', title: null, date: '2026-08-12' }] })).toBe(
      '1 class still to catch up',
    );
    expect(
      state({
        state: 'behind',
        outstanding: [
          { id: 'c1', title: null, date: '2026-08-12' },
          { id: 'c2', title: null, date: '2026-08-14' },
        ],
      }),
    ).toBe('2 classes still to catch up');
  });

  it('stays quiet for a student who was simply there', () => {
    expect(state({ state: 'attended', outstanding: [] })).toBeNull();
    expect(describeRunCatchup(null)).toBeNull();
  });

  it('says the gap out loud', () => {
    expect(state({ state: 'unknown', outstanding: [] })).toBe('No record of these classes');
    expect(state({ state: 'caught_up', outstanding: [] })).toContain('Caught up');
  });
});

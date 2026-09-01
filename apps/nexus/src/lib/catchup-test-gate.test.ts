import { describe, it, expect } from 'vitest';
import { decideCatchupGate, describeCatchupGate, type GateClassEvidence } from './catchup-test-gate';

const cls = (over: Partial<GateClassEvidence> = {}): GateClassEvidence => ({
  scheduled_class_id: 'c1',
  title: 'Islamic Architecture in India',
  scheduled_date: '2026-08-11',
  attended: true,
  absence: null,
  ...over,
});

/**
 * How production actually records an absence: an absence row and NO attendance
 * row at all. nexus_attendance stores only presence.
 */
const absent = (over: Partial<GateClassEvidence> = {}) =>
  cls({ attended: null, absence: { kind: 'no_show', caught_up_at: null, excused_at: null }, ...over });

describe('decideCatchupGate', () => {
  it('lets a student who was in the class straight through', () => {
    expect(decideCatchupGate([cls()]).blocked).toBe(false);
  });

  it('holds the test shut on an absence that is not caught up', () => {
    const d = decideCatchupGate([absent()]);
    expect(d.blocked).toBe(true);
    expect(d.outstanding).toHaveLength(1);
  });

  it('opens once the catch-up is done', () => {
    const d = decideCatchupGate([
      absent({ absence: { kind: 'no_show', caught_up_at: '2026-08-20T10:00:00Z', excused_at: null } }),
    ]);
    expect(d.blocked).toBe(false);
  });

  /**
   * A teacher excusing an absence is them saying the student owes nothing for
   * that class. Holding the test shut afterwards would overrule the teacher
   * using a rule they never saw.
   */
  it('does not block an absence a teacher excused', () => {
    const d = decideCatchupGate([
      absent({ absence: { kind: 'no_show', caught_up_at: null, excused_at: '2026-08-19T10:00:00Z' } }),
    ]);
    expect(d.blocked).toBe(false);
  });

  /**
   * THE RULE THIS MODULE EXISTS FOR. The roster engine parks missing evidence
   * in excused_pending_catchup so it never DEMANDS a test it cannot vouch for.
   * Reading that same state as "refused" would lock a present student out
   * whenever an attendance sync ran late.
   */
  it('never blocks on missing evidence', () => {
    expect(decideCatchupGate([cls({ attended: null, absence: null })]).blocked).toBe(false);
    expect(decideCatchupGate([cls({ attended: false, absence: null })]).blocked).toBe(false);
  });

  /**
   * THE BUG THAT ALMOST SHIPPED. This was first written as
   * `if (e.attended !== false) return false`, which reads correctly and never
   * fires: nexus_attendance stores only presence, so on production all 387
   * rows are attended = true and an absent student has no row at all. The gate
   * would have refused nobody while looking exactly right.
   */
  it('blocks on an absence row even though no attendance row exists', () => {
    const d = decideCatchupGate([
      { scheduled_class_id: 'c1', title: 'Islamic Architecture in India', scheduled_date: '2026-08-11',
        attended: null, absence: { kind: 'no_show', caught_up_at: null, excused_at: null } },
    ]);
    expect(d.blocked).toBe(true);
  });

  /** A stale absence row must not shut out someone attendance says was there. */
  it('lets a present student through despite an absence row', () => {
    const d = decideCatchupGate([
      absent({ attended: true }),
    ]);
    expect(d.blocked).toBe(false);
  });

  /**
   * All three kinds open a catch-up window, so all three leave material the
   * test is about to ask about. opted_out gets its own window length rather
   * than an exemption.
   */
  it.each(['no_show', 'late_joiner', 'opted_out'])('blocks on an un-caught-up %s', (kind) => {
    const d = decideCatchupGate([absent({ absence: { kind, caught_up_at: null, excused_at: null } })]);
    expect(d.blocked).toBe(true);
  });

  it('blocks on the un-caught-up class even when another is settled', () => {
    const d = decideCatchupGate([
      cls({ scheduled_class_id: 'a', attended: true }),
      absent({ scheduled_class_id: 'b', title: 'Perspective Cube', scheduled_date: '2026-08-14' }),
    ]);
    expect(d.blocked).toBe(true);
    expect(d.outstanding.map((o) => o.id)).toEqual(['b']);
  });

  it('names outstanding classes oldest first, the order they must be worked', () => {
    const d = decideCatchupGate([
      absent({ scheduled_class_id: 'late', title: 'Later', scheduled_date: '2026-08-18' }),
      absent({ scheduled_class_id: 'early', title: 'Earlier', scheduled_date: '2026-08-11' }),
    ]);
    expect(d.outstanding.map((o) => o.id)).toEqual(['early', 'late']);
  });

  it('is open for a run that covers no classes at all', () => {
    expect(decideCatchupGate([]).blocked).toBe(false);
  });
});

describe('describeCatchupGate', () => {
  it('names the class so the refusal ends in an action', () => {
    const d = decideCatchupGate([absent()]);
    expect(describeCatchupGate(d)).toBe(
      'Finish your catch-up for Islamic Architecture in India first, then this test opens for you.',
    );
  });

  it('joins two classes readably', () => {
    const d = decideCatchupGate([
      absent({ scheduled_class_id: 'a', title: 'Islamic Architecture', scheduled_date: '2026-08-11' }),
      absent({ scheduled_class_id: 'b', title: 'Perspective Cube', scheduled_date: '2026-08-14' }),
    ]);
    expect(describeCatchupGate(d)).toBe(
      'Finish your catch-up for Islamic Architecture and Perspective Cube first, then this test opens for you.',
    );
  });

  it('falls back to a count when a class has no title', () => {
    const d = decideCatchupGate([absent({ title: null }), absent({ scheduled_class_id: 'b', title: null })]);
    expect(describeCatchupGate(d)).toBe(
      'Finish your 2 pending catch-up classes first, then this test opens for you.',
    );
  });

  it('says nothing when the door is open', () => {
    expect(describeCatchupGate(decideCatchupGate([cls()]))).toBe('');
  });
});

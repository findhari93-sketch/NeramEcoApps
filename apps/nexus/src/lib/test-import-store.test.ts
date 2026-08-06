import { describe, it, expect } from 'vitest';
import { pickEarliestImport } from './test-import-store';

/**
 * Which upload gets the credit for a question.
 *
 * A bank question is reusable by design, so a popular one ends up in several
 * tests and therefore matches several import rows. Only one of them created it;
 * the rest found it already there. Naming a reuse as the origin would tell a
 * teacher their chapter-one questions came from a chapter-four paper.
 */

describe('pickEarliestImport', () => {
  it('credits the upload that created the question, not one that reused it', () => {
    const out = pickEarliestImport([
      { test_id: 'reuse', created_at: '2026-09-01T00:00:00.000Z' },
      { test_id: 'origin', created_at: '2026-08-06T16:32:54.794Z' },
      { test_id: 'later', created_at: '2026-10-01T00:00:00.000Z' },
    ]);
    expect(out?.test_id).toBe('origin');
  });

  it('returns null when the question came from no import at all', () => {
    // Hand-authored questions and everything older than the archive.
    expect(pickEarliestImport([])).toBe(null);
  });

  it('still answers when a timestamp is missing or unparseable', () => {
    // Total rather than partial: a bad date should cost the exact ordering,
    // never the whole answer.
    expect(
      pickEarliestImport([
        { test_id: 'a', created_at: null },
        { test_id: 'b', created_at: 'not-a-date' },
      ])?.test_id,
    ).toBe('a');

    expect(
      pickEarliestImport([
        { test_id: 'broken', created_at: 'not-a-date' },
        { test_id: 'good', created_at: '2026-08-06T00:00:00.000Z' },
      ])?.test_id,
    ).toBe('good');
  });

  it('is stable on a tie, so the same question does not change story between reads', () => {
    const rows = [
      { test_id: 'first', created_at: '2026-08-06T00:00:00.000Z' },
      { test_id: 'second', created_at: '2026-08-06T00:00:00.000Z' },
    ];
    expect(pickEarliestImport(rows)?.test_id).toBe('first');
    expect(pickEarliestImport([...rows])?.test_id).toBe('first');
  });

  it('does not mutate or reorder what it was given', () => {
    const rows = [
      { test_id: 'b', created_at: '2026-09-01T00:00:00.000Z' },
      { test_id: 'a', created_at: '2026-08-01T00:00:00.000Z' },
    ];
    pickEarliestImport(rows);
    expect(rows.map((r) => r.test_id)).toEqual(['b', 'a']);
  });
});

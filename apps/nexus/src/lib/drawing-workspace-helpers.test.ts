import { describe, it, expect } from 'vitest';
import { parseAttemptParam, resolveAttemptIndex } from './drawing-attempt-selection';
import { notesFromAnnotations } from './drawing-region-notes';
import { briefStartsOpen, primaryAction, railMode } from './drawing-workspace-state';
import { dueLabel } from './assignment-due-label';

describe('parseAttemptParam', () => {
  it.each([
    [null, null],
    [undefined, null],
    ['', null],
    ['0', null],
    ['-1', null],
    ['abc', null],
    ['2.5', null],
    ['1e2', null],
    ['2', 2],
    [' 3 ', 3],
  ])('%j reads as %j', (raw, expected) => {
    expect(parseAttemptParam(raw as string | null | undefined)).toBe(expected);
  });
});

describe('resolveAttemptIndex', () => {
  it('defaults to the newest attempt', () => {
    expect(resolveAttemptIndex(3, null)).toEqual({ index: 3, isLatest: true, valid: true });
  });
  it('opens an earlier attempt that exists', () => {
    expect(resolveAttemptIndex(3, 1)).toEqual({ index: 1, isLatest: false, valid: true });
  });
  it('falls back to the newest for an attempt that does not exist', () => {
    expect(resolveAttemptIndex(3, 99)).toEqual({ index: 3, isLatest: true, valid: false });
  });
  it('has nothing to show before the first drawing', () => {
    expect(resolveAttemptIndex(0, null)).toEqual({ index: 0, isLatest: true, valid: true });
    expect(resolveAttemptIndex(0, 2).valid).toBe(false);
  });
});

describe('notesFromAnnotations', () => {
  it('numbers regions and older notes together, in order', () => {
    const { notes, regions } = notesFromAnnotations([
      { id: 'a', x: 0.1, y: 0.1, width: 0.2, height: 0.2, comment: ' Vanishing lines drift ' },
      { area: 'top-left', label: 'Shade the right face', severity: 'high' },
      { id: 'b', x: 0.5, y: 0.5, width: 0.1, height: 0.1, comment: '' },
    ]);
    expect(notes.map((n) => [n.number, n.text, !!n.region])).toEqual([
      [1, 'Vanishing lines drift', true],
      [2, 'Shade the right face', false],
      [3, 'Look again at this part', true],
    ]);
    expect(regions.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('refuses boxes outside the drawing and gives a missing id one', () => {
    const { notes, regions } = notesFromAnnotations([
      { x: 1.5, y: 0, width: 0.2, height: 0.2, comment: 'Off the sheet' },
      { x: 0.2, y: 0.2, width: 0.2, height: 0.2, comment: 'No id' },
    ]);
    // The first is not a region, but its words still count as a note.
    expect(notes).toHaveLength(2);
    expect(notes[0].region).toBeNull();
    expect(regions).toHaveLength(1);
    expect(regions[0].id).toBe('r1');
  });

  it.each([null, undefined, 'text', 42, {}])('treats %j as no notes', (raw) => {
    expect(notesFromAnnotations(raw)).toEqual({ notes: [], regions: [] });
  });
});

describe('railMode', () => {
  const attempt = (o: Partial<{ status: string; released: boolean; review_updating: boolean }>) => ({
    status: 'submitted',
    released: false,
    review_updating: false,
    ...o,
  });

  it('reads each state', () => {
    expect(railMode(null)).toBe('not_submitted');
    expect(railMode(attempt({}))).toBe('awaiting');
    expect(railMode(attempt({ status: 'completed', review_updating: true }))).toBe('updating');
    expect(railMode(attempt({ status: 'completed', released: true }))).toBe('reviewed');
    expect(railMode(attempt({ status: 'reviewed', released: true }))).toBe('reviewed');
    expect(railMode(attempt({ status: 'redo', released: true }))).toBe('redo');
  });

  it('opens the brief only before anything is handed in', () => {
    expect(briefStartsOpen('not_submitted')).toBe(true);
    expect(briefStartsOpen('awaiting')).toBe(false);
    expect(briefStartsOpen('redo')).toBe(false);
  });
});

describe('primaryAction', () => {
  it('names the next step for each window', () => {
    expect(primaryAction('first')?.label).toBe('Submit your drawing');
    expect(primaryAction('redo')?.label).toBe('Redo your drawing');
    expect(primaryAction('replace')).toMatchObject({ label: 'Replace your drawing', variant: 'outlined' });
    expect(primaryAction('replace')?.hint).toBeTruthy();
    expect(primaryAction('locked')).toBeNull();
  });

  it('never uses a dash for punctuation in what the student reads', () => {
    for (const mode of ['first', 'redo', 'replace'] as const) {
      const a = primaryAction(mode)!;
      expect(`${a.label} ${a.hint ?? ''}`).not.toMatch(/—|--/);
    }
  });
});

describe('dueLabel', () => {
  const clock = (o: Record<string, unknown>) =>
    ({ personal_due: '2026-09-20', status: 'open', is_late_joiner: false, days_remaining: 2, days_elapsed: 1, ...o }) as any;

  it('says nothing once the student cannot hand in', () => {
    expect(dueLabel(clock({}), false)).toBeNull();
    expect(dueLabel(null, true)).toBeNull();
  });
  it('words a deadline', () => {
    expect(dueLabel(clock({}), true)).toEqual({ label: '2d left', overdue: false });
    expect(dueLabel(clock({ days_remaining: 0 }), true)?.label).toBe('Due today');
    expect(dueLabel(clock({ status: 'overdue' }), true)).toEqual({ label: 'Overdue', overdue: true });
    expect(dueLabel(clock({ is_late_joiner: true, days_elapsed: 3, days_remaining: 4 }), true)?.label).toBe('Day 3 · 4d left');
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import StudentsView, { reasonKeysOf, stateOf, type StudentsViewProps } from './StudentsView';
import { emptyTally } from '@/lib/catchup-buckets';
import { EMPTY_STANDING } from '@/lib/catchup-standing';
import { emptyDiagnosisTally, type Diagnosis } from '@/lib/catchup-diagnosis';
import type { Item, Payload, Row } from './types';

/**
 * The Students view replaced Needs action, Reasons and Standing (2026-10).
 * What it must hold: one row per student, the diagnosis card and the reason
 * chip combine, each row says WHY in a sentence, the sheet shows the reason the
 * student gave wherever they gave it, and All clear shows the wall.
 */

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    scheduled_class_id: 'class-1',
    kind: 'no_show',
    status: 'waiting',
    step: 'watch',
    chained: false,
    due_on: null,
    overdue: false,
    active: false,
    days_left: null,
    recommended: false,
    reason_code: null,
    reason_note: null,
    reason_submitted_at: null,
    reason_source: null,
    reason: null,
    followup_sent_at: null,
    caught_up_at: null,
    excuse_note: null,
    watched: false,
    assignments_outstanding: 0,
    assignments_total: 0,
    has_test: false,
    test_passed: false,
    excused: false,
    progress: 'Not opened',
    class: { title: 'Pritzker Prize', scheduled_date: '2026-09-11' },
    ...over,
  };
}

function row(name: string, state: Diagnosis, items: Item[] = [item()], sentence = `${name} sentence`): Row {
  return {
    journey_id: null,
    student: { id: name.toLowerCase(), name, email: null, phone: '9999999999', avatar_url: null },
    diagnosis: { state, sentence, focusItemId: null, lastActiveAt: null },
    bucket: state === 'all_clear' ? 'all_clear' : 'in_progress',
    openCount: state === 'all_clear' ? 0 : 1,
    blockedOnUs: 0,
    totals: { total: 0, completed: 0, blocked: 0, pendingTeacher: 0 },
    missedTotals: { total: 1, completed: 0, open: 1, overdue: 0, waiting: 1 },
    clock: { active: false, waiting: 1, overdue: false, daysLeft: null, stalled: true },
    pace: { state: 'done', deficit: 0, remaining: 0 },
    standing: { ...EMPTY_STANDING, clearedTotal: state === 'all_clear' ? 3 : 0 },
    celebration: null,
    items,
  };
}

function payload(students: Row[]): Payload {
  const byDiagnosis = emptyDiagnosisTally();
  for (const s of students) byDiagnosis[stateOf(s)] += 1;
  return {
    classroomId: 'room-1',
    students,
    classes: [],
    reasonTally: {},
    noRecording: [],
    pendingRecap: [],
    totals: {
      studentsBehind: 0,
      studentsCatchingUp: 0,
      outstanding: 0,
      clearedThisMonth: 0,
      explained: 0,
      unexplained: 0,
      byBucket: emptyTally(),
      byDiagnosis,
      hiddenDormant: 0,
    },
  };
}

function props(students: Row[], over: Partial<StudentsViewProps> = {}): StudentsViewProps {
  return {
    data: payload(students),
    busy: null,
    onAct: vi.fn(),
    onNudge: vi.fn(),
    onNudgeMany: vi.fn(async () => {}),
    onReload: vi.fn(),
    onNote: vi.fn(),
    onMarkCelebrated: vi.fn(),
    diagnosis: null,
    onDiagnosis: vi.fn(),
    reason: null,
    onReason: vi.fn(),
    ...over,
  };
}

const unwell = item({ reason: { code: 'unwell', note: 'Fever', source: 'before_class', said: 'Told us before class' }, reason_code: null });
const clash = item({ id: 'item-2', reason: { code: 'clash', note: null, source: 'away', said: 'Away 10 Sep to 20 Sep' } });

beforeEach(() => {
  window.localStorage.clear();
});

describe('StudentsView', () => {
  it('draws each student once, with the why-sentence on the row', () => {
    render(
      <StudentsView
        {...props([row('Asha', 'stuck', [unwell], 'Failed the section 2 check 3 times.'), row('Bala', 'stopped')])}
      />,
    );
    expect(screen.getAllByText('Asha')).toHaveLength(1);
    expect(screen.getByText('Failed the section 2 check 3 times.')).toBeTruthy();
  });

  it('shows only the pressed card', () => {
    render(<StudentsView {...props([row('Asha', 'stuck'), row('Bala', 'on_track')], { diagnosis: 'on_track' })} />);
    expect(screen.queryByText('Asha')).toBeNull();
    expect(screen.getByText('Bala')).toBeTruthy();
  });

  it('combines the reason chip with the card, and counts students per reason', () => {
    const onReason = vi.fn();
    const { rerender } = render(
      <StudentsView {...props([row('Asha', 'stuck', [unwell]), row('Bala', 'stuck', [clash]), row('Chitra', 'stopped', [item()])], { onReason })} />,
    );
    // Counts are students, and "No reason" is a filter of its own.
    fireEvent.click(screen.getByRole('button', { name: 'Unwell 1' }));
    expect(onReason).toHaveBeenCalledWith('unwell');
    expect(screen.getByRole('button', { name: 'No reason 1' })).toBeTruthy();

    rerender(
      <StudentsView {...props([row('Asha', 'stuck', [unwell]), row('Bala', 'stuck', [clash]), row('Chitra', 'stopped', [item()])], { reason: 'clash', onReason })} />,
    );
    expect(screen.getByText('Bala')).toBeTruthy();
    expect(screen.queryByText('Asha')).toBeNull();
    expect(screen.queryByText('Chitra')).toBeNull();
  });

  it('opens the sheet with each class, the reason, and where they said it', () => {
    render(<StudentsView {...props([row('Asha', 'stuck', [unwell, clash])])} />);
    fireEvent.click(screen.getByRole('button', { name: /^Asha, Stuck/ }));
    const sheet = screen.getByRole('dialog', { name: /Asha, catch-up/ });
    expect(within(sheet).getByText(/Told us before class/)).toBeTruthy();
    expect(within(sheet).getByText(/"Fever"/)).toBeTruthy();
    expect(within(sheet).getByText(/Away 10 Sep to 20 Sep/)).toBeTruthy();
    expect(within(sheet).getByText('Classes (2)')).toBeTruthy();
  });

  it('says "No reason given" in red rather than leaving it blank', () => {
    render(<StudentsView {...props([row('Asha', 'not_started', [item()])])} />);
    fireEvent.click(screen.getByRole('button', { name: /^Asha, Not started/ }));
    expect(within(screen.getByRole('dialog')).getByText('No reason given')).toBeTruthy();
  });

  it('never offers a nudge to someone on track', () => {
    render(<StudentsView {...props([row('Asha', 'on_track')], { diagnosis: 'on_track' })} />);
    expect(screen.queryByRole('button', { name: /Nudge/ })).toBeNull();
  });

  it('All clear shows the wall with a personal note, and no Teams group post', () => {
    render(<StudentsView {...props([row('Asha', 'all_clear', []), row('Bala', 'stuck')], { diagnosis: 'all_clear' })} />);
    expect(screen.getByText('Asha')).toBeTruthy();
    expect(screen.queryByText('Bala')).toBeNull();
    expect(screen.getByRole('button', { name: /Send a note/ })).toBeTruthy();
    expect(screen.queryByText(/in Teams/)).toBeNull();
  });
});

describe('helpers', () => {
  it('reasonKeysOf reads only open classes and folds unknown into none', () => {
    const r = row('Asha', 'stuck', [unwell, item({ id: 'x', status: 'done', reason: { code: 'family', note: null, source: 'after_class', said: '' } }), item({ id: 'y' })]);
    expect([...reasonKeysOf(r)].sort()).toEqual(['none', 'unwell']);
  });

  it('stateOf falls back to the bucket for a payload cached before diagnoses', () => {
    const r = { ...row('Asha', 'stuck'), diagnosis: undefined, bucket: 'run_over' as const };
    expect(stateOf(r)).toBe('over_time');
  });
});

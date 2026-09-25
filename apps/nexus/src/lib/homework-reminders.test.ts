import { describe, expect, it } from 'vitest';
import {
  addDaysYmd,
  decidePlan,
  homeworkPhrase,
  homeworkReminderText,
  owedAssignments,
  reminderStateOf,
  shortIstDate,
  type HomeworkPlanRow,
} from './homework-reminders';
import type { ClassAssignment, StudentWork } from './class-work';

/**
 * Every three days until it is in. What matters:
 *  - handing it in ends the plan before any reminder that day;
 *  - a student removed from the classroom, or homework withdrawn, ends it too;
 *  - a paused student is skipped, not ended;
 *  - the message names only what is still owed.
 */

const A: ClassAssignment = { id: 'a1', title: 'Perspective study', timing: 'homework', due_at: null };
const B: ClassAssignment = { id: 'a2', title: 'Shading sheet', timing: 'homework', due_at: null };

function work(byAssignment: StudentWork['byAssignment']): StudentWork {
  const vals = Object.values(byAssignment);
  return {
    total: vals.length,
    handedIn: vals.filter((v) => v === 'in' || v === 'late').length,
    late: vals.filter((v) => v === 'late').length,
    redo: vals.filter((v) => v === 'redo').length,
    missing: vals.filter((v) => v === 'missing').length,
    byAssignment,
  };
}

function plan(over: Partial<HomeworkPlanRow> = {}): HomeworkPlanRow {
  return {
    id: 'p1',
    scheduled_class_id: 'c1',
    classroom_id: 'r1',
    student_id: 's1',
    every_days: 3,
    started_by: 't1',
    next_on: '2026-09-27',
    sends: 1,
    last_sent_at: '2026-09-24T10:00:00Z',
    ended_at: null,
    end_reason: null,
    ...over,
  };
}

describe('decidePlan', () => {
  const base = { today: '2026-09-27', assignments: [A, B], onRoster: true };

  it('sends on the due day, naming only what is still owed', () => {
    const d = decidePlan({ ...base, plan: plan(), work: work({ a1: 'in', a2: 'missing' }) });
    expect(d.action).toBe('send');
    expect(d.action === 'send' && d.owed.map((a) => a.id)).toEqual(['a2']);
  });

  it('waits before the due day', () => {
    const d = decidePlan({ ...base, today: '2026-09-26', plan: plan(), work: work({ a1: 'missing', a2: 'missing' }) });
    expect(d.action).toBe('wait');
  });

  it('ends the plan the day everything is in, even on a due day', () => {
    const d = decidePlan({ ...base, plan: plan(), work: work({ a1: 'in', a2: 'late' }) });
    expect(d).toMatchObject({ action: 'end', reason: 'handed_in' });
  });

  it('keeps reminding about work sent back to redo', () => {
    const d = decidePlan({ ...base, plan: plan(), work: work({ a1: 'in', a2: 'redo' }) });
    expect(d.action).toBe('send');
  });

  it('ends for a student who left the classroom, or when the homework is withdrawn', () => {
    expect(decidePlan({ ...base, onRoster: false, plan: plan(), work: null })).toMatchObject({ reason: 'left' });
    expect(decidePlan({ ...base, assignments: [], plan: plan(), work: null })).toMatchObject({ reason: 'no_homework' });
  });

  it('skips a paused student without ending the plan', () => {
    const d = decidePlan({ ...base, dormant: true, plan: plan(), work: work({ a1: 'missing', a2: 'missing' }) });
    expect(d.action).toBe('wait');
  });
});

describe('the words', () => {
  it('lists what is owed naturally', () => {
    expect(homeworkPhrase(['A'])).toBe('"A"');
    expect(homeworkPhrase(['A', 'B'])).toBe('"A" and "B"');
    expect(homeworkPhrase(['A', 'B', 'C'])).toBe('"A", "B" and "C"');
    expect(owedAssignments([A, B], null)).toHaveLength(2);
  });

  it('writes a first message and a repeat, with no dashes', () => {
    for (const kind of ['first', 'repeat'] as const) {
      const t = homeworkReminderText({ classTitle: 'Basic 3D shapes', dateLabel: 'Mon, 15 Sept', kind });
      expect(t.body).toContain('{homework}');
      expect(t.body).toContain('{firstName}');
      expect(t.body).toContain('Basic 3D shapes on Mon, 15 Sept');
      expect(`${t.subject} ${t.body}`).not.toMatch(/—|--/);
    }
  });
});

describe('dates', () => {
  it('adds days across a month end', () => {
    expect(addDaysYmd('2026-09-29', 3)).toBe('2026-10-02');
  });

  it('reads a date in IST whatever the machine zone', () => {
    expect(shortIstDate('2026-09-27')).toMatch(/27/);
    expect(shortIstDate(null)).toBe('');
  });

  it('shows no next date once a plan has ended', () => {
    const s = reminderStateOf(plan({ ended_at: '2026-09-26T00:00:00Z', end_reason: 'handed_in' }));
    expect(s).toMatchObject({ active: false, nextOn: null, endReason: 'handed_in' });
  });
});

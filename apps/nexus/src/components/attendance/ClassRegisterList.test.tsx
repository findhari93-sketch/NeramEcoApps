import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ClassRegisterList from './ClassRegisterList';
import type { Insights } from '@/components/timetable/attendance/types';

function student(over: Record<string, unknown>) {
  return {
    id: 'x',
    name: 'Student',
    avatar_url: null,
    phone: null,
    study_stage: null,
    dormant: false,
    enrolled_at: '2026-06-01T00:00:00Z',
    joinedAfterClass: false,
    rsvp: 'attending',
    reason: null,
    attended: false,
    joined_at: null,
    left_at: null,
    duration_minutes: null,
    joinedLate: false,
    leftEarly: false,
    droppedMidClass: false,
    barelyAttended: false,
    minutesIn: 0,
    lateByMin: 0,
    leftEarlyByMin: 0,
    outMin: 0,
    segments: [],
    absence: null,
    catchup: null,
    bucket: 'missed_no_reason',
    group: 'no_reason',
    ...over,
  };
}

// Five ordinary, distinct names, deliberately not sharing a first word: the
// shared search's fuzzy fallback resembles names by their words, so any two
// rows starting "Student " would both match a query for either one, which is
// a fact about the shared search, not something this screen should work
// around. See task-7-report.md, Fix round 1, for the reasoning.
const INSIGHTS = {
  class: {
    id: 'class-1',
    title: 'Basic 3D Shape Composition',
    scheduled_date: '2026-09-15',
    start_time: '19:00:00',
    end_time: '20:30:00',
  },
  summary: {
    held: { start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:40:00.000Z', source: 'observed', minutes: 70 },
  },
  students: [
    student({ id: 'a', name: 'Ananya Iyer', attended: true, minutesIn: 70, group: 'whole', segments: [{ start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:40:00.000Z' }] }),
    student({ id: 'b', name: 'Bhavesh Nair', attended: true, minutesIn: 45, leftEarlyByMin: 25, group: 'partly', segments: [{ start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:15:00.000Z' }] }),
    student({ id: 'c', name: 'Meera Krishnan', group: 'no_reason' }),
    student({ id: 'd', name: 'Kavya Sundaram', group: 'reason', absence: { reason_code: 'unwell', reason_note: 'had fever', reason_source: 'student' } }),
    student({ id: 'e', name: 'Rohit Pillai', group: 'joined_later' }),
  ],
} as unknown as Insights;

describe('ClassRegisterList', () => {
  it('counts each group on its tile', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    expect(screen.getByTestId('stat-tile-whole').textContent).toContain('1');
    expect(screen.getByTestId('stat-tile-partly').textContent).toContain('1');
    expect(screen.getByTestId('stat-tile-no_reason').textContent).toContain('1');
  });

  it('shows how long a partly present student was there and why that is the group', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    expect(screen.getByText('45 of 70 min')).toBeTruthy();
    expect(screen.getByText(/Left 25 min early/)).toBeTruthy();
  });

  it('shows a missed student their own words', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    expect(screen.getByText(/had fever/)).toBeTruthy();
  });

  it('filters to one group when its tile is pressed', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    fireEvent.click(screen.getByTestId('stat-tile-no_reason'));
    expect(screen.queryByText('Ananya Iyer')).toBe(null);
    expect(screen.getByText('Meera Krishnan')).toBeTruthy();
  });

  it('keeps students who joined later out of the groups and names them apart', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    expect(screen.getByText(/1 joined the course after this class/)).toBeTruthy();
  });

  it('narrows every group with the shared search, across sections', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    fireEvent.change(screen.getByLabelText(/Find a student/i), { target: { value: 'Meera' } });
    expect(screen.getByText('Meera Krishnan')).toBeTruthy();
    expect(screen.queryByText('Ananya Iyer')).toBe(null);
  });

  it('the expand row is a real button, reachable by keyboard, that announces its open state', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    // A present row (Ananya Iyer stayed the whole class) is the one that
    // expands. A native <button> is in the tab order and Enter/Space activate
    // it the way any browser control does, so being this element IS being
    // keyboard reachable: there is no separate key handler to fall out of sync.
    const row = screen.getByRole('button', { name: /Ananya Iyer/i });
    expect(row.tagName).toBe('BUTTON');
    expect(row.getAttribute('aria-expanded')).toBe('false');

    row.focus();
    expect(document.activeElement).toBe(row);

    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/in 7:00 PM to 8:10 PM/)).toBeTruthy();

    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });

  it('a missed row has nothing to expand and is not a button', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    expect(screen.queryByRole('button', { name: /Meera Krishnan/i })).toBe(null);
  });
});

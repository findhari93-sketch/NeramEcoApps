import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RegisterGrid from './RegisterGrid';
import type { RegisterResponse } from '@/app/api/attendance/register/route';

const DATA: RegisterResponse = {
  classroom_id: 'c1',
  range: { from: '2026-09-01', to: '2026-09-16' },
  classes: [
    {
      id: 'class-1',
      title: 'Basic 3D Shape Composition',
      scheduled_date: '2026-09-15',
      start_time: '19:00:00',
      end_time: '20:30:00',
      held: { start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:40:00.000Z', source: 'observed', minutes: 70 },
      measured: true,
      sync_status: 'ok',
      counts: { whole: 1, partly: 1, reason: 0, noReason: 1, joinedLater: 0 },
    },
  ],
  students: [
    { id: 's1', name: 'Student A', avatar_url: null, study_stage: null, enrolled_at: '2026-06-01T00:00:00Z', present: 1, counted: 1, rate: 100 },
    { id: 's2', name: 'Student B', avatar_url: null, study_stage: null, enrolled_at: '2026-06-01T00:00:00Z', present: 1, counted: 1, rate: 100 },
    { id: 's3', name: 'Student C', avatar_url: null, study_stage: null, enrolled_at: '2026-06-01T00:00:00Z', present: 0, counted: 1, rate: 0 },
  ],
  cells: {
    'class-1': {
      s1: { g: 'whole', min: 70 },
      s2: { g: 'partly', min: 45, early: 25 },
      s3: { g: 'no_reason' },
    },
  },
  paused_hidden: 2,
};

describe('RegisterGrid', () => {
  it('marks each student with a letter, not colour alone', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    // Inside the table only: the legend below it prints the same letters.
    const grid = within(screen.getByRole('table'));
    expect(grid.getByText('F')).toBeTruthy();
    expect(grid.getByText('P')).toBeTruthy();
    expect(grid.getByText('X')).toBeTruthy();
  });

  it('spells out each mark for a screen reader', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    const cell = screen.getByLabelText(/Student B, Tue 15 Sep: partly there, 45 min, left 25 min early/i);
    expect(cell.getAttribute('href')).toBe('/teacher/attendance/class-1?student=s2');
  });

  it('shows each attendance percentage', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    expect(screen.getAllByText('100%').length).toBe(2);
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('explains how many paused students are hidden', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    expect(screen.getByText(/2 paused/i)).toBeTruthy();
  });
});

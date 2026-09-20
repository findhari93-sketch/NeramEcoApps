import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ClassAttendanceCard from './ClassAttendanceCard';
import type { RegisterClass } from '@/app/api/attendance/register/route';

const CLS: RegisterClass = {
  id: 'class-1',
  title: 'Basic 3D Shape Composition',
  scheduled_date: '2026-09-15',
  start_time: '19:00:00',
  end_time: '20:30:00',
  held: { start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:40:00.000Z', source: 'observed', minutes: 70 },
  measured: true,
  sync_status: 'ok',
  counts: { whole: 14, partly: 6, away: 0, reason: 1, noReason: 16, joinedLater: 3 },
};

describe('ClassAttendanceCard', () => {
  it('names the class, the day and the time it really ran', () => {
    render(<ClassAttendanceCard cls={CLS} href="/teacher/attendance/class-1" />);
    expect(screen.getByText('Basic 3D Shape Composition')).toBeTruthy();
    expect(screen.getByText(/Tue 15 Sep/)).toBeTruthy();
    expect(screen.getByText(/held 7:00 to 8:10 PM/)).toBeTruthy();
  });

  it('writes every count out, so colour is never the only signal', () => {
    render(<ClassAttendanceCard cls={CLS} href="/teacher/attendance/class-1" />);
    expect(screen.getByText(/14 whole/)).toBeTruthy();
    expect(screen.getByText(/6 partly/)).toBeTruthy();
    expect(screen.getByText(/1 reason/)).toBeTruthy();
    expect(screen.getByText(/16 no reason/)).toBeTruthy();
    // joinedLater sits outside the bar (they owe nothing for a class before
    // they joined) but is a real count the route returns, so it must still
    // be written out somewhere rather than silently dropped.
    expect(screen.getByText(/3 joined the course later/)).toBeTruthy();
  });

  it('links to the class', () => {
    render(<ClassAttendanceCard cls={CLS} href="/teacher/attendance/class-1?view=classes" />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/teacher/attendance/class-1?view=classes');
  });

  it('says so when Teams attendance has not been read', () => {
    render(
      <ClassAttendanceCard
        cls={{ ...CLS, measured: false, held: null, counts: { whole: 0, partly: 0, away: 0, reason: 0, noReason: 0, joinedLater: 0 } }}
        href="/teacher/attendance/class-1"
      />,
    );
    expect(screen.getByText(/Attendance not read from Teams yet/)).toBeTruthy();
  });

  it('does not claim attendance was never read when it was, even if nobody counts against anyone', () => {
    render(
      <ClassAttendanceCard
        cls={{ ...CLS, measured: true, counts: { whole: 0, partly: 0, away: 0, reason: 0, noReason: 0, joinedLater: 0 } }}
        href="/teacher/attendance/class-1"
      />,
    );
    expect(screen.getByText(/Nobody was counted for this class/)).toBeTruthy();
    expect(screen.queryByText(/Attendance not read from Teams yet/)).toBe(null);
    // No bar for four zeroes: it would carry no information.
    expect(screen.queryByRole('img')).toBe(null);
  });

  it('still surfaces joined-later students when the class was measured but everyone else counts to zero', () => {
    render(
      <ClassAttendanceCard
        cls={{ ...CLS, measured: true, counts: { whole: 0, partly: 0, away: 0, reason: 0, noReason: 0, joinedLater: 5 } }}
        href="/teacher/attendance/class-1"
      />,
    );
    expect(screen.getByText(/Nobody was counted for this class/)).toBeTruthy();
    expect(screen.getByText(/5 joined the course later/)).toBeTruthy();
  });
});

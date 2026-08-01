import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import ClassAttendanceDialog from './ClassAttendanceDialog';

const ATTENDANCE_URL = '/api/timetable/attendance-report';
const INSIGHTS_URL = '/api/timetable/class-insights';

const ATTENDANCE_BODY = {
  attendance: [
    {
      id: 'a1',
      student_id: 's1',
      attended: false,
      joined_at: null,
      left_at: null,
      duration_minutes: null,
      source: '',
      student: { id: 's1', name: 'Aarthi R', email: 'aarthi@x.com', avatar_url: null },
    },
  ],
  summary: { present: 0, absent: 1, total: 1, missed: 0, explained: 0, caughtUp: 0 },
  sync: { synced_at: null, status: null, message: null, has_meeting: true },
  class: { scheduled_date: '2026-07-31', start_time: '19:00' },
};

const INSIGHTS_BODY = {
  class: { id: 'c1', title: 'JEE', attendance_synced_at: null, has_meeting: true },
  summary: {
    rosterSize: 1,
    present: 0,
    absent: 1,
    attendanceRate: 0,
    avgDuration: 0,
    lateCount: 0,
    leftEarlyCount: 0,
    droppedCount: 0,
  },
  buckets: { attendingAttended: 0, attendingAbsent: 1, declinedAbsent: 0, declinedAttended: 0 },
  reasonTally: {},
  students: [],
};

/** Every fetch this dialog made, in order, so a test can count them by route. */
let calls: { url: string; method: string }[] = [];

function callsTo(url: string, method = 'GET') {
  return calls.filter((c) => c.url.startsWith(url) && c.method === method);
}

function renderDialog(props: Partial<React.ComponentProps<typeof ClassAttendanceDialog>> = {}) {
  return render(
    <ClassAttendanceDialog
      open
      onClose={() => {}}
      classId="c1"
      classTitle="JEE Preparation B.Arch"
      classroomId="room1"
      teamsMeetingId="m1"
      getToken={async () => 'token'}
      {...props}
    />,
  );
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.startsWith(INSIGHTS_URL)) {
        return { ok: true, json: async () => INSIGHTS_BODY } as Response;
      }
      if (url.startsWith(ATTENDANCE_URL)) {
        return { ok: true, json: async () => ATTENDANCE_BODY } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClassAttendanceDialog', () => {
  it('loads only the register on open, never the analytics', async () => {
    // The whole point of the lazy tab: a teacher marking the register must not
    // pay for the insights query or the recharts bundle behind it.
    renderDialog();
    await screen.findByText('Aarthi R');
    expect(callsTo(ATTENDANCE_URL)).toHaveLength(1);
    expect(callsTo(INSIGHTS_URL)).toHaveLength(0);
  });

  it('fetches the analytics once, on first open of that tab', async () => {
    renderDialog();
    await screen.findByText('Aarthi R');

    fireEvent.click(screen.getByRole('tab', { name: 'How it went' }));
    await waitFor(() => expect(callsTo(INSIGHTS_URL)).toHaveLength(1));

    // Back and forth must not refetch: nothing has changed.
    fireEvent.click(screen.getByRole('tab', { name: 'Who came' }));
    await screen.findByText('Aarthi R');
    fireEvent.click(screen.getByRole('tab', { name: 'How it went' }));
    await waitFor(() => expect(callsTo(INSIGHTS_URL)).toHaveLength(1));
  });

  it('refetches the analytics after a correction, so the KPIs cannot lie', async () => {
    renderDialog();
    await screen.findByText('Aarthi R');

    fireEvent.click(screen.getByRole('tab', { name: 'How it went' }));
    await waitFor(() => expect(callsTo(INSIGHTS_URL)).toHaveLength(1));

    fireEvent.click(screen.getByRole('tab', { name: 'Who came' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Attendance for Aarthi R/i }));
    await waitFor(() => expect(callsTo(ATTENDANCE_URL, 'POST')).toHaveLength(1));

    fireEvent.click(screen.getByRole('tab', { name: 'How it went' }));
    await waitFor(() => expect(callsTo(INSIGHTS_URL)).toHaveLength(2));
  });

  it('offers no Sync from Teams when the class has no meeting', async () => {
    // The insights dialog used to offer Sync unconditionally, so a class with
    // no meeting got a button whose only possible outcome was a failed POST.
    renderDialog({ teamsMeetingId: null });
    await screen.findByText('Aarthi R');
    expect(screen.queryByRole('button', { name: /sync from teams/i })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'How it went' }));
    await waitFor(() => expect(callsTo(INSIGHTS_URL)).toHaveLength(1));
    expect(screen.queryByRole('button', { name: /sync from teams/i })).toBeNull();
  });

  it('tells the caller about a manual mark, so the panel behind it updates', async () => {
    const onChanged = vi.fn();
    renderDialog({ onChanged });
    fireEvent.click(await screen.findByRole('checkbox', { name: /Attendance for Aarthi R/i }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('opens on the tab the caller asked for', async () => {
    renderDialog({ initialTab: 'how' });
    await waitFor(() => expect(callsTo(INSIGHTS_URL)).toHaveLength(1));
    // getAttribute rather than a jest-dom matcher: the app tsconfig does not
    // pull in @testing-library/jest-dom's types, so those fail type-check.
    expect(screen.getByRole('tab', { name: 'How it went' }).getAttribute('aria-selected')).toBe('true');
  });
});

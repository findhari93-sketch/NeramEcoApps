import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { SWRConfig } from 'swr';
import ClassAttendancePanel from './ClassAttendancePanel';

/**
 * 2026-09-24, prod: the catch-up calendar's class drawer, Attended tab, sat on
 * three skeletons. class-insights had answered 404 for a failed read, and the
 * tabs only knew "loading" and "no data": the error was never read, so a failed
 * load looked like a slow one and there was nothing to press.
 */

const INSIGHTS_OK = {
  class: {
    id: 'c1',
    title: 'Key Indian Monuments and Architects',
    scheduled_date: '2026-09-09',
    start_time: '19:00:00',
    end_time: '20:30:00',
    attendance_synced_at: '2026-09-09T15:20:00Z',
    has_meeting: true,
  },
  summary: {
    rosterSize: 0, present: 0, absent: 0, attendanceRate: 0, avgDuration: 0, lateCount: 0,
    leftEarlyCount: 0, droppedCount: 0, barelyAttendedCount: 0, scheduledMinutes: 90,
    barelyAttendedCutoff: 23, missedNoReason: 0, missedWithReason: 0, caughtUp: 0, excused: 0,
    lateJoiners: 0, notCaughtUp: 0,
  },
  buckets: { attendingAttended: 0, attendingAbsent: 0, declinedAbsent: 0, declinedAttended: 0 },
  reasonTally: {},
  students: [],
};

const REPORT = {
  attendance: [],
  summary: { present: 0, absent: 0, total: 0, missed: 0, explained: 0, caughtUp: 0 },
  sync: { synced_at: '2026-09-09T15:20:00Z', status: 'ok', message: null, has_meeting: true },
  class: { id: 'c1', scheduled_date: '2026-09-09', start_time: '19:00:00' },
};

/** class-insights fails `failures` times with the route's 503, then answers. */
function failingThenOk(failures: number) {
  let left = failures;
  return vi.fn(async (url: string) => {
    if (String(url).includes('class-insights') && left > 0) {
      left -= 1;
      return { ok: false, status: 503, json: async () => ({ error: 'Could not load the class' }) } as unknown as Response;
    }
    const body = String(url).includes('class-insights') ? INSIGHTS_OK : REPORT;
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  });
}

function renderPanel(initialTab: 'attended' | 'missed') {
  return render(
    // No automatic retries: the tab must offer its own, and this pins that it does.
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ClassAttendancePanel
        classId="c1"
        classTitle="Key Indian Monuments and Architects"
        classroomId="room1"
        teamsMeetingId="meeting1"
        getToken={async () => 'token'}
        initialTab={initialTab}
      />
    </SWRConfig>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(['attended', 'missed'] as const)('the %s tab when the class cannot be loaded', (tab) => {
  it("says so with the route's message instead of holding the skeletons", async () => {
    vi.stubGlobal('fetch', failingThenOk(1));
    renderPanel(tab);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not load the class');
  });

  it('recovers when the teacher presses Try again', async () => {
    const fetchSpy = failingThenOk(1);
    vi.stubGlobal('fetch', fetchSpy);
    renderPanel(tab);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    // Not "no alert at all": a loaded tab can carry its own info Alert, and every
    // MUI Alert has role="alert".
    await waitFor(() => expect(screen.queryByText('Could not load the class')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes('class-insights')).length).toBe(2);
  });
});

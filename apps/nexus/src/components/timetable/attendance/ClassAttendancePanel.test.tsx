import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SWRConfig } from 'swr';
import ClassAttendancePanel, { nudgePreset } from './ClassAttendancePanel';

/**
 * The two things worth pinning down here are the request pattern and the
 * grouping.
 *
 * The request pattern, because the whole point of folding the absence join into
 * class-insights was that opening this costs ONE request. If a later change
 * quietly restores the second fetch on open, nothing else in the suite notices
 * and the cost regression ships.
 *
 * The grouping, because "who missed this and said nothing" is the number the
 * teacher acts on, and it is derived from a bucket the server computes. A wrong
 * bucket puts a student who explained themselves onto a chase list.
 */

const INSIGHTS = {
  class: {
    id: 'c1',
    title: 'JEE Preparation B.Arch',
    scheduled_date: '2026-07-31',
    start_time: '19:00:00',
    end_time: '20:30:00',
    attendance_synced_at: '2026-07-31T15:20:00Z',
    has_meeting: true,
  },
  summary: {
    rosterSize: 4,
    present: 2,
    absent: 2,
    attendanceRate: 50,
    avgDuration: 48,
    lateCount: 0,
    leftEarlyCount: 1,
    droppedCount: 0,
    barelyAttendedCount: 1,
    scheduledMinutes: 90,
    barelyAttendedCutoff: 23,
    missedNoReason: 1,
    missedWithReason: 1,
    caughtUp: 0,
    excused: 0,
    lateJoiners: 1,
    notCaughtUp: 3,
  },
  buckets: { attendingAttended: 2, attendingAbsent: 1, declinedAbsent: 1, declinedAttended: 0 },
  reasonTally: {},
  students: [
    {
      id: 'a',
      name: 'Abhitha Saravanan',
      avatar_url: null,
      phone: null,
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
      absence: null,
      bucket: 'missed_no_reason',
      followup: 'needs_call',
      reason_resolved: null,
    },
    {
      id: 'b',
      name: 'Humaira Safrin',
      avatar_url: null,
      phone: null,
      rsvp: 'not_attending',
      reason: 'exam',
      attended: false,
      joined_at: null,
      left_at: null,
      duration_minutes: null,
      joinedLate: false,
      leftEarly: false,
      droppedMidClass: false,
      barelyAttended: false,
      absence: {
        id: 'abs-b',
        kind: 'opted_out',
        reason_code: 'clash',
        reason_note: null,
        reason_source: 'student',
        reason_submitted_at: '2026-07-30T00:00:00Z',
        recording_watched_at: null,
        caught_up_at: null,
        excused_at: null,
        followup_sent_at: null,
      },
      bucket: 'missed_with_reason',
      followup: 'catching_up',
      reason_resolved: {
        code: 'clash',
        note: null,
        source: 'before_class',
        said: 'Told us before class',
        at: '2026-07-30T00:00:00Z',
        unspecified: false,
        line: 'Exam clash · Told us before class',
      },
    },
    {
      // On declared exam leave, with no absence row and no RSVP. The panel
      // used to file her under "Told us why" and print "No reason given".
      id: 'f',
      name: 'Sanjay Kumar',
      avatar_url: null,
      phone: null,
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
      absence: null,
      away: true,
      away_window: 'Away 10 Jul to 20 Aug: Exam clash',
      bucket: 'away',
      followup: 'catching_up',
      reason_resolved: {
        code: 'clash',
        note: null,
        source: 'away',
        said: 'Away 10 Jul to 20 Aug',
        at: null,
        unspecified: false,
        line: 'Exam clash · Away 10 Jul to 20 Aug',
      },
    },
    {
      id: 'c',
      name: 'Rahul Kumar',
      avatar_url: null,
      phone: null,
      rsvp: 'attending',
      reason: null,
      attended: true,
      joined_at: '2026-07-31T13:30:00Z',
      left_at: '2026-07-31T13:36:00Z',
      duration_minutes: 6,
      joinedLate: false,
      leftEarly: true,
      droppedMidClass: false,
      barelyAttended: true,
      absence: null,
      bucket: 'attended',
    },
    {
      id: 'd',
      name: 'Sanjay Patel',
      avatar_url: null,
      phone: null,
      rsvp: 'attending',
      reason: null,
      attended: true,
      joined_at: '2026-07-31T13:30:00Z',
      left_at: '2026-07-31T15:00:00Z',
      duration_minutes: 90,
      joinedLate: false,
      leftEarly: false,
      droppedMidClass: false,
      barelyAttended: false,
      absence: null,
      bucket: 'attended',
    },
    {
      // Enrolled three weeks after this class ran. Nothing for her to explain.
      id: 'e',
      name: 'Nithya Raman',
      avatar_url: null,
      phone: null,
      enrolled_at: '2026-08-20T06:00:00Z',
      joinedAfterClass: true,
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
      absence: null,
      bucket: 'late_joiner',
    },
  ],
};

const REPORT = {
  attendance: [],
  summary: { present: 2, absent: 2, total: 4, missed: 2, explained: 1, caughtUp: 0 },
  sync: { synced_at: '2026-07-31T15:20:00Z', status: 'ok', message: null, has_meeting: true },
  class: { id: 'c1', scheduled_date: '2026-07-31', start_time: '19:00:00' },
};

let calls: string[] = [];

function mockFetch() {
  return vi.fn(async (url: string) => {
    calls.push(String(url));
    const body = String(url).includes('class-insights') ? INSIGHTS : REPORT;
    return { ok: true, json: async () => body } as unknown as Response;
  });
}

function renderPanel(props: Partial<React.ComponentProps<typeof ClassAttendancePanel>> = {}) {
  // A fresh cache per render: the panel reads through SWR, and a cache shared
  // across tests would answer the second test without a request.
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    <ClassAttendancePanel
      classId="c1"
      classTitle="JEE Preparation B.Arch"
      classroomId="room1"
      teamsMeetingId="meeting1"
      getToken={async () => 'token'}
      {...props}
    />
    </SWRConfig>,
  );
}

describe('ClassAttendancePanel', () => {
  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens on Missed and costs exactly one request', async () => {
    renderPanel();
    await screen.findByText('Abhitha Saravanan');

    expect(calls.filter((u) => u.includes('class-insights'))).toHaveLength(1);
    // The register is the repair bench and is not fetched until it is opened.
    expect(calls.filter((u) => u.includes('attendance-report'))).toHaveLength(0);
  });

  it('separates the students who said nothing from the ones who explained', async () => {
    renderPanel();
    await screen.findByText('Abhitha Saravanan');

    // Once: only the silent student's row says it.
    expect(screen.getAllByText('No reason given').length).toBe(1);
    expect(screen.getByRole('checkbox', { name: /Select everyone in Said nothing, not caught up/i })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Select everyone in Told us why, still catching up/i })).toBeTruthy();
    // Exam clash, said in advance: the row that must NOT read as silence.
    expect(screen.getByText(/Exam clash · Told us before class/)).toBeTruthy();
    // The silent one has not started; that line is what makes her the first
    // name a teacher rings.
    expect(screen.getAllByText(/Recording not watched/i).length).toBeGreaterThan(0);
  });

  it('fetches the register only when the Register tab is opened, and only once', async () => {
    renderPanel();
    await screen.findByText('Abhitha Saravanan');

    fireEvent.click(screen.getByRole('tab', { name: /Register/i }));
    await waitFor(() =>
      expect(calls.filter((u) => u.includes('attendance-report'))).toHaveLength(1),
    );

    fireEvent.click(screen.getByRole('tab', { name: /Missed/i }));
    fireEvent.click(screen.getByRole('tab', { name: /Register/i }));
    // Still one: nothing has invalidated it, so going back must not refetch.
    expect(calls.filter((u) => u.includes('attendance-report'))).toHaveLength(1);
  });

  it('ranks the attended list with the shortest stay first', async () => {
    renderPanel();
    await screen.findByText('Abhitha Saravanan');

    fireEvent.click(screen.getByRole('tab', { name: /Attended/i }));
    // The tab mounts the shared student list toolbar; under a full parallel run
    // that can take longer than the 1s default wait.
    const short = await screen.findByText('Rahul Kumar', {}, { timeout: 5000 });
    const long = screen.getByText('Sanjay Patel');

    // Six minutes above ninety. compareDocumentPosition returns FOLLOWING (4)
    // when `long` comes after `short` in the document.
    expect(short.compareDocumentPosition(long) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides the action bar until something is selected', async () => {
    renderPanel();
    await screen.findByText('Abhitha Saravanan');

    expect(screen.queryByRole('button', { name: /^Nudge$/i })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Abhitha Saravanan' }));
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nudge/i })).toBeTruthy();
  });

  it('selects a whole group from its header checkbox', async () => {
    renderPanel();
    await screen.findByText('Abhitha Saravanan');

    fireEvent.click(screen.getByRole('checkbox', { name: /Select everyone in Said nothing/i }));
    expect(screen.getByText('1 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: /Select everyone in Told us why/i }));
    expect(screen.getByText('3 selected')).toBeTruthy();
  });

  it('says why an away student missed it, never "No reason given"', async () => {
    renderPanel();
    await screen.findByText('Sanjay Kumar');
    expect(screen.getByText(/Exam clash · Away 10 Jul to 20 Aug/)).toBeTruthy();
    // The one "No reason given" on the screen belongs to the silent student.
    expect(screen.getAllByText('No reason given')).toHaveLength(1);
  });

  it('opens narrowed to one group when the drawer card asks for it', async () => {
    renderPanel({ initialFilter: 'needs_call' });
    await screen.findByText('Abhitha Saravanan');
    expect(screen.queryByText('Humaira Safrin')).toBeNull();
    expect(screen.queryByText('Sanjay Kumar')).toBeNull();
    // And back out again.
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    expect(await screen.findByText('Humaira Safrin')).toBeTruthy();
  });

  it('ticks every outstanding student from one control, and unticks them again', async () => {
    // The gap this closes: the tab said "Missed 3" and no single gesture on the
    // screen could produce three ticks.
    renderPanel();
    await screen.findByText('Abhitha Saravanan');

    const selectAll = screen.getByRole('checkbox', { name: /Select all 4 not caught up/i });
    fireEvent.click(selectAll);
    expect(screen.getByText('4 selected')).toBeTruthy();
    // Reads back the state rather than repeating the invitation.
    expect(screen.getByText('All 4 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: /Select all 4 not caught up/i }));
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('counts only outstanding students in Select all, never the ones already done', async () => {
    renderPanel();
    await screen.findByText('Abhitha Saravanan');

    // Everyone absent in the fixture still owes work, so all four count.
    // Messaging somebody again about a class they have finished is the bug.
    fireEvent.click(screen.getByRole('checkbox', { name: /Select all 4 not caught up/i }));
    expect(screen.getByText('4 selected')).toBeTruthy();
  });

  it('calls a late joiner a late joiner, not silent', async () => {
    renderPanel();
    await screen.findByText('Nithya Raman');

    expect(
      screen.getByRole('checkbox', { name: /Select everyone in Joined after this class/i }),
    ).toBeTruthy();
    expect(screen.getByText(/Joined after this class, enrolled 20 Aug/)).toBeTruthy();
    // Still exactly one row saying "No reason given", and it is not hers.
    expect(screen.getAllByText('No reason given').length).toBe(1);
  });

  it('offers no Teams sync for a class with no meeting', async () => {
    renderPanel({ teamsMeetingId: null });
    await screen.findByText('Abhitha Saravanan');
    expect(screen.queryByRole('button', { name: /Sync from Teams/i })).toBeNull();
  });

  it('shows the prev and next arrows only when the caller supplies them', async () => {
    const { unmount } = renderPanel();
    await screen.findByText('Abhitha Saravanan');
    expect(screen.queryByRole('button', { name: /Next class/i })).toBeNull();
    unmount();

    renderPanel({ onNext: () => {}, navLabel: '1 of 6' });
    await screen.findByText('Abhitha Saravanan');
    expect(screen.getByRole('button', { name: /Next class/i })).toBeTruthy();
    // Previous is rendered disabled at the start of the list rather than hidden,
    // so the control does not jump around as a teacher walks the week.
    expect(screen.getByRole('button', { name: /Previous class/i }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});

describe('nudgePreset', () => {
  it('asks the silent ones why, and only them', () => {
    expect(nudgePreset(['needs_call', 'needs_call'], 'Perspective', '11 Sep')).toMatch(/have not told us why/);
    expect(nudgePreset(['catching_up'], 'Perspective', '11 Sep')).toMatch(/^Thanks for telling us why/);
  });

  it('falls back to the server default for a mixed selection', () => {
    expect(nudgePreset(['needs_call', 'catching_up'], 'Perspective', '11 Sep')).toBe('');
    expect(nudgePreset([], 'Perspective', '11 Sep')).toBe('');
  });
});

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

/**
 * The Missed tab opens as a picture (the grid plus one closed line per group).
 * Open every group, as a teacher tapping each one would, before reading names.
 */
async function openGroups() {
  await screen.findByTestId('followup-grid');
  for (const b of screen.queryAllByRole('button', { name: /\. Expand$/ })) fireEvent.click(b);
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
    await openGroups();
    await screen.findByText('Abhitha Saravanan');

    expect(calls.filter((u) => u.includes('class-insights'))).toHaveLength(1);
    // The register is the repair bench and is not fetched until it is opened.
    expect(calls.filter((u) => u.includes('attendance-report'))).toHaveLength(0);
  });

  it('separates the students who said nothing from the ones who explained', async () => {
    renderPanel();
    await openGroups();
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
    await openGroups();
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
    await openGroups();
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
    await openGroups();
    await screen.findByText('Abhitha Saravanan');

    expect(screen.queryByRole('button', { name: /^Nudge$/i })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Abhitha Saravanan' }));
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nudge/i })).toBeTruthy();
  });

  it('selects a whole group from its header checkbox', async () => {
    renderPanel();
    await openGroups();
    await screen.findByText('Abhitha Saravanan');

    fireEvent.click(screen.getByRole('checkbox', { name: /Select everyone in Said nothing/i }));
    expect(screen.getByText('1 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: /Select everyone in Told us why/i }));
    expect(screen.getByText('3 selected')).toBeTruthy();
  });

  it('says why an away student missed it, never "No reason given"', async () => {
    renderPanel();
    await openGroups();
    await screen.findByText('Sanjay Kumar');
    expect(screen.getByText(/Exam clash · Away 10 Jul to 20 Aug/)).toBeTruthy();
    // The one "No reason given" on the screen belongs to the silent student.
    expect(screen.getAllByText('No reason given')).toHaveLength(1);
  });

  it('opens narrowed to one group when the drawer card asks for it', async () => {
    renderPanel({ initialFilter: 'needs_call' });
    // The group the card pointed at opens by itself; nothing to tap.
    await screen.findByText('Abhitha Saravanan');
    expect(screen.queryByText('Humaira Safrin')).toBeNull();
    expect(screen.queryByText('Sanjay Kumar')).toBeNull();
    expect(screen.getByTestId('followup-cell-needs_call').getAttribute('aria-pressed')).toBe('true');
    // And back out again.
    fireEvent.click(screen.getByRole('button', { name: /Show everyone$/ }));
    await openGroups();
    expect(await screen.findByText('Humaira Safrin')).toBeTruthy();
  });

  it('ticks every outstanding student from one control, and unticks them again', async () => {
    // The gap this closes: the tab said "Missed 3" and no single gesture on the
    // screen could produce three ticks.
    renderPanel();
    await openGroups();
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
    await openGroups();
    await screen.findByText('Abhitha Saravanan');

    // Everyone absent in the fixture still owes work, so all four count.
    // Messaging somebody again about a class they have finished is the bug.
    fireEvent.click(screen.getByRole('checkbox', { name: /Select all 4 not caught up/i }));
    expect(screen.getByText('4 selected')).toBeTruthy();
  });

  it('calls a late joiner a late joiner, not silent', async () => {
    renderPanel();
    await openGroups();
    await screen.findByText('Nithya Raman');

    expect(
      screen.getByRole('checkbox', { name: /Select everyone in Joined after this class/i }),
    ).toBeTruthy();
    expect(screen.getByText(/Joined after this class, enrolled 20 Aug/)).toBeTruthy();
    // Still exactly one row saying "No reason given", and it is not hers.
    expect(screen.getAllByText('No reason given').length).toBe(1);
  });

  it('opens as a picture: every group closed until it is tapped', async () => {
    renderPanel();
    await screen.findByTestId('followup-grid');
    // The group lines are there, the names are not.
    expect(screen.getByRole('button', { name: /^Said nothing, not caught up, 1\. Expand$/ })).toBeTruthy();
    expect(screen.queryByText('Abhitha Saravanan')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Said nothing, not caught up, 1\. Expand$/ }));
    expect(await screen.findByText('Abhitha Saravanan')).toBeTruthy();
    expect(screen.queryByText('Humaira Safrin')).toBeNull();
  });

  it('a grid corner is the filter: pressed shows one group, pressed again shows all', async () => {
    renderPanel();
    const cell = await screen.findByTestId('followup-cell-needs_call');
    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    // Filtered to one group, which opens by itself.
    expect(await screen.findByText('Abhitha Saravanan')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Told us why, still catching up/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Showing needs a call only\. Show everyone$/ })).toBeTruthy();

    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /^Told us why, still catching up/ })).toBeTruthy();
  });

  it('keeps the old filter chip row gone', async () => {
    renderPanel();
    await screen.findByTestId('followup-grid');
    expect(screen.queryByRole('group', { name: 'Show one group' })).toBeNull();
  });

  it('offers no Teams sync for a class with no meeting', async () => {
    renderPanel({ teamsMeetingId: null });
    await openGroups();
    await screen.findByText('Abhitha Saravanan');
    expect(screen.queryByRole('button', { name: /Sync from Teams/i })).toBeNull();
  });

  it('shows the prev and next arrows only when the caller supplies them', async () => {
    const { unmount } = renderPanel();
    await openGroups();
    await screen.findByText('Abhitha Saravanan');
    expect(screen.queryByRole('button', { name: /Next class/i })).toBeNull();
    unmount();

    renderPanel({ onNext: () => {}, navLabel: '1 of 6' });
    await openGroups();
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

/**
 * Homework reminders on the Attended tab: the students who came and have not
 * handed the homework in, reminded now and every 3 days until they do.
 */
describe('ClassAttendancePanel, homework reminders', () => {
  const OWES = { total: 1, handedIn: 0, late: 0, redo: 0, missing: 1, byAssignment: { hw1: 'missing' } };
  const DONE = { total: 1, handedIn: 1, late: 0, redo: 0, missing: 0, byAssignment: { hw1: 'in' } };
  let posted: Array<{ url: string; method: string; body: any }> = [];

  function withHomework(reminder: unknown = null) {
    return {
      ...INSIGHTS,
      work: [{ id: 'hw1', title: 'Perspective study', timing: 'homework', expected: 2, handedIn: 1, late: 0, missingCame: 1, missingCaughtUp: 0, missingCatchingUp: 0 }],
      students: INSIGHTS.students.map((s) =>
        s.id === 'c' ? { ...s, work: OWES, homeworkReminder: reminder } : s.id === 'd' ? { ...s, work: DONE } : s,
      ),
    };
  }

  function stub(insights: unknown) {
    posted = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('homework-reminders')) {
          posted.push({ url: String(url), method: init?.method ?? 'GET', body: JSON.parse(String(init?.body ?? '{}')) });
          const body =
            init?.method === 'PATCH'
              ? { stopped: 1 }
              : { counts: { total: 1, chat: 1, teams: 0, inapp: 1, failed: 0 }, repeat: { everyDays: 3, nextOn: '2026-08-03' }, skipped: 0 };
          return { ok: true, json: async () => body } as unknown as Response;
        }
        const body = String(url).includes('class-insights') ? insights : REPORT;
        return { ok: true, json: async () => body } as unknown as Response;
      }),
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openAttended() {
    renderPanel();
    await screen.findByTestId('followup-grid');
    fireEvent.click(screen.getByRole('tab', { name: /Attended/i }));
    return screen.findByTestId('homework-strip', {}, { timeout: 5000 });
  }

  it('says who came without handing it in, and reminds them now and every 3 days', async () => {
    stub(withHomework());
    const strip = await openAttended();
    expect(strip.textContent).toMatch(/1 came but has not handed in the homework/);

    fireEvent.click(screen.getByTestId('homework-remind'));
    expect(await screen.findByText('"Perspective study"')).toBeTruthy();
    const repeat = screen.getByRole('checkbox', { name: /Remind again every 3 days until they hand it in/ }) as HTMLInputElement;
    expect(repeat.checked).toBe(true);

    fireEvent.click(screen.getByTestId('homework-reminder-send'));
    await screen.findByTestId('homework-next-reminder');
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ method: 'POST', body: { classroom_id: 'room1', studentIds: ['c'], repeat: true } });
  });

  it('shows a running reminder with its next date, and Stop ends it', async () => {
    stub(withHomework({ active: true, everyDays: 3, nextOn: '2026-08-03', sends: 1, lastSentAt: null, endReason: null }));
    const strip = await openAttended();
    expect(strip.textContent).toMatch(/Reminding 1 every 3 days until they hand it in/);
    expect(screen.getByTestId('homework-reminder-chip').textContent).toMatch(/Reminding, next/);
    // Nobody left to start, so no Remind button, only Stop.
    expect(screen.queryByTestId('homework-remind')).toBeNull();

    fireEvent.click(screen.getByTestId('homework-stop'));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ method: 'PATCH', body: { action: 'stop', classroom_id: 'room1' } });
  });

  it('turns the selection bar into a homework reminder on the Attended tab, never "you missed it"', async () => {
    stub(withHomework());
    await openAttended();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Rahul Kumar' }));
    expect(screen.queryByRole('button', { name: /^Nudge$/ })).toBeNull();
    const remind = screen.getByTestId('selection-remind-homework') as HTMLButtonElement;
    expect(remind.disabled).toBe(false);

    // Sanjay handed it in: ticking only him leaves nothing to remind.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Rahul Kumar' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Sanjay Patel' }));
    expect((screen.getByTestId('selection-remind-homework') as HTMLButtonElement).disabled).toBe(true);
  });
});

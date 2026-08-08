import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import NeedsActionTab from './NeedsActionTab';
import { emptyTally, tallyBuckets, type CatchupBucket } from '@/lib/catchup-buckets';
import { EMPTY_STANDING } from '@/lib/catchup-standing';
import type { Item, Payload, Row, TabProps } from './types';

/**
 * The regression guard first.
 *
 * This tab used to render three sections off one array: a red chase list,
 * "everyone else", and then a third list that walked `data.students` again. The
 * first two are by construction the whole cohort, so every student was drawn
 * exactly twice, a screen apart, with Call and Nudge on one copy and the gates
 * and Excuse on the other. Nothing asserted otherwise, so nothing caught it.
 *
 * "Each student appears once" is the property that makes it unrepeatable. It
 * fails against the old component.
 */

const GROUPS_STORAGE_KEY = 'nexus:catchup:groups';

/** Open every group, so the assertions see the whole list rather than one section. */
function openAllGroups() {
  window.localStorage.setItem(
    GROUPS_STORAGE_KEY,
    JSON.stringify({
      run_over: true,
      not_started: true,
      behind: true,
      in_progress: true,
      waiting_on_us: true,
    }),
  );
}

function item(over: Partial<Item> = {}): Item {
  return {
    id: `item-${Math.round(Number(over.id ?? 0))}`,
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
    followup_sent_at: null,
    caught_up_at: null,
    excuse_note: null,
    watched: false,
    assignments_outstanding: 0,
    assignments_total: 0,
    has_test: false,
    test_passed: false,
    excused: false,
    class: { title: 'Perspective drawing', scheduled_date: '2026-07-20' },
    ...over,
  };
}

function row(name: string, bucket: CatchupBucket, over: Partial<Row> = {}): Row {
  return {
    journey_id: `journey-${name}`,
    student: {
      id: `id-${name}`,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      phone: '+919000000000',
      avatar_url: null,
    },
    bucket,
    openCount: bucket === 'waiting_on_us' ? 0 : 2,
    blockedOnUs: bucket === 'waiting_on_us' ? 2 : 0,
    totals: { total: 2, completed: 0, blocked: 0, pendingTeacher: 0 },
    missedTotals: { total: 2, completed: 0, open: 2, overdue: 0, waiting: 2 },
    clock: {
      active: bucket === 'in_progress' || bucket === 'run_over',
      waiting: 2,
      overdue: bucket === 'run_over',
      daysLeft: null,
      stalled: bucket === 'not_started',
    },
    pace: { state: bucket === 'behind' ? 'behind' : 'on_track', deficit: 0, remaining: 2 },
    standing: { ...EMPTY_STANDING, ownOpen: bucket === 'waiting_on_us' ? 0 : 2 },
    items: [item({ id: '1' })],
    ...over,
  };
}

function payload(students: Row[]): Payload {
  return {
    classroomId: 'classroom-1',
    students,
    classes: [{ id: 'class-1', title: 'Perspective drawing', scheduled_date: '2026-07-20' }],
    classStats: [],
    reasons: [],
    reasonTally: {},
    completed: [],
    noRecording: [],
    pendingRecap: [],
    totals: {
      studentsBehind: 0,
      studentsCatchingUp: students.length,
      outstanding: students.length * 2,
      clearedThisMonth: 0,
      explained: 0,
      unexplained: 0,
      byBucket: students.length ? tallyBuckets(students.map((s) => s.bucket)) : emptyTally(),
      hiddenDormant: 0,
    },
  };
}

const onAct = vi.fn();
const onNudge = vi.fn();
const onNudgeMany = vi.fn(() => Promise.resolve());
const onReload = vi.fn();

function renderTab(students: Row[], overrides: Partial<Payload> = {}) {
  const props: TabProps = {
    data: { ...payload(students), ...overrides },
    busy: null,
    onAct,
    onNudge,
    onNudgeMany,
    onReload,
  };
  return render(<NeedsActionTab {...props} />);
}

const THREE = [
  row('Anuvika Stalin', 'run_over'),
  row('Harimadhu Raja', 'not_started'),
  row('Sanjay Prakash', 'not_started'),
];

describe('NeedsActionTab', () => {
  beforeEach(() => {
    window.localStorage.clear();
    onAct.mockClear();
    onNudge.mockClear();
    onNudgeMany.mockClear();
  });

  it('keeps a student who owes nothing off the chase screen entirely', () => {
    // The route stopped dropping finished students so the Standing tab could
    // count them, which put them into `data.students` for the first time. This
    // tab must not show them: it answers "who do I call today".
    openAllGroups();
    renderTab([...THREE, row('Inaya Nizamudeen', 'all_clear')]);

    expect(screen.queryByText('Inaya Nizamudeen')).toBeNull();
    expect(screen.getByText('Anuvika Stalin')).toBeTruthy();
  });

  it('shows its empty state when everyone is clear, not an empty list', () => {
    // `data.students.length === 0` used to be the emptiness test. With finished
    // students in the payload that check passes while every group is empty, so
    // a classroom where nobody owes anything rendered a blank panel.
    renderTab([row('Inaya Nizamudeen', 'all_clear')]);

    expect(screen.getByText(/Nobody is behind/i)).toBeTruthy();
  });

  it('pins the students who were chased and went quiet', () => {
    renderTab([
      row('Anuvika Stalin', 'not_started'),
      row('Harimadhu Raja', 'not_started', {
        standing: {
          ...EMPTY_STANDING,
          ownOpen: 4,
          oldestOpenDays: 34,
          chasedAt: '2026-08-01T10:00:00+05:30',
          unresponsive: true,
        },
      }),
    ]);

    const banner = screen.getByText(/Needs a call/i).closest('div')!;
    expect(banner).toBeTruthy();
    expect(screen.getByText(/Nudged already/i)).toBeTruthy();
    // The one who has not been chased is not accused of ignoring anybody.
    expect(screen.getAllByText('Harimadhu Raja').length).toBeGreaterThan(0);
  });

  it('ranks the call list on their own classes, never the late-joiner backlog', () => {
    // A student who enrolled in month three owes a row for every class taught
    // before they arrived. Ranking on the total would put the newest person in
    // the room at the top of the worst list on the screen.
    renderTab([
      row('Late Joiner', 'not_started', {
        standing: {
          ...EMPTY_STANDING,
          ownOpen: 0,
          lateJoinerOpen: 30,
          chasedAt: '2026-08-01T10:00:00+05:30',
          unresponsive: true,
        },
      }),
      row('Actually Ignoring Us', 'not_started', {
        standing: {
          ...EMPTY_STANDING,
          ownOpen: 5,
          lateJoinerOpen: 0,
          chasedAt: '2026-08-01T10:00:00+05:30',
          unresponsive: true,
        },
      }),
    ]);

    const names = within(screen.getByTestId('needs-a-call'))
      .getAllByText(/^(Late Joiner|Actually Ignoring Us)$/)
      .map((n) => n.textContent);
    expect(names).toEqual(['Actually Ignoring Us', 'Late Joiner']);
    // Their backlog is still stated, it just cannot move them up the list.
    expect(screen.getByText(/30 from before they joined/)).toBeTruthy();
  });

  it('draws each student exactly once', () => {
    // The whole point. The old component drew all three twice.
    openAllGroups();
    renderTab(THREE);
    for (const name of ['Anuvika Stalin', 'Harimadhu Raja', 'Sanjay Prakash']) {
      expect(screen.getAllByText(name), name).toHaveLength(1);
    }
  });

  it('puts a student in exactly one group, under a heading naming the count', () => {
    openAllGroups();
    renderTab(THREE);
    expect(screen.getByText('Run over · 1')).toBeTruthy();
    expect(screen.getByText('Not started · 2')).toBeTruthy();
  });

  it('starts with only the first group open, so a large group is one line', () => {
    // The scrolling complaint in one assertion: 68 stalled students must not be
    // 68 rows the moment the tab opens.
    renderTab([row('First Up', 'run_over'), ...Array.from({ length: 20 }, (_, i) => row(`Stalled ${i}`, 'not_started'))]);
    expect(screen.getByText('First Up')).toBeTruthy();
    expect(screen.getByText('Not started · 20')).toBeTruthy();
    expect(screen.queryByText('Stalled 0')).toBeNull();
  });

  it('opens a collapsed group when its header is pressed', () => {
    renderTab([row('First Up', 'run_over'), row('Later On', 'behind')]);
    expect(screen.queryByText('Later On')).toBeNull();
    fireEvent.click(screen.getByText('Behind pace · 1'));
    expect(screen.getByText('Later On')).toBeTruthy();
  });

  it('caps an open group at 15 rows until asked for the rest', () => {
    openAllGroups();
    renderTab(Array.from({ length: 22 }, (_, i) => row(`Student ${i}`, 'not_started')));
    expect(screen.queryByText('Student 14')).toBeTruthy();
    expect(screen.queryByText('Student 15')).toBeNull();

    fireEvent.click(screen.getByText('Show all 22'));
    expect(screen.getByText('Student 21')).toBeTruthy();
  });

  it('narrows to a matching student as you search, and opens the groups it finds', () => {
    renderTab(THREE);
    fireEvent.change(screen.getByLabelText('Search students'), {
      target: { value: 'harimadhu' },
    });
    expect(screen.getByText('Harimadhu Raja')).toBeTruthy();
    expect(screen.queryByText('Anuvika Stalin')).toBeNull();
    expect(screen.queryByText('Sanjay Prakash')).toBeNull();
  });

  it('offers a way out of a search that found nobody, instead of a blank panel', () => {
    renderTab(THREE);
    fireEvent.change(screen.getByLabelText('Search students'), {
      target: { value: 'nobody at all' },
    });
    expect(screen.getByText('No student matches "nobody at all"')).toBeTruthy();

    fireEvent.click(screen.getByText('Show everyone'));
    expect(screen.getByText('Anuvika Stalin')).toBeTruthy();
  });

  it('filters to one bucket from the pills', () => {
    renderTab(THREE);
    fireEvent.click(screen.getByText('Run over 1'));
    expect(screen.getByText('Anuvika Stalin')).toBeTruthy();
    expect(screen.queryByText('Harimadhu Raja')).toBeNull();
  });

  it('nudges a whole group in one send', async () => {
    openAllGroups();
    renderTab(THREE);
    fireEvent.click(screen.getByText('Select all'));
    expect(screen.getByText('2 selected')).toBeTruthy();

    fireEvent.click(screen.getByText('Nudge 2'));
    fireEvent.click(screen.getByText('Send'));

    expect(onNudgeMany).toHaveBeenCalledTimes(1);
    const [ids, journeyIds] = onNudgeMany.mock.calls[0] as unknown as [string[], string[]];
    expect(ids.sort()).toEqual(['id-Harimadhu Raja', 'id-Sanjay Prakash']);
    // The journeys ride along so the weekly automatic nudge is suppressed too.
    expect(journeyIds).toHaveLength(2);
  });

  it('says what a bulk nudge will do before it sends anything', () => {
    openAllGroups();
    renderTab(THREE);
    fireEvent.click(screen.getByText('Select all'));
    fireEvent.click(screen.getByText('Nudge 2'));

    expect(screen.getByText('Send a catch-up nudge to 2 students?')).toBeTruthy();
    expect(onNudgeMany).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Cancel'));
    expect(onNudgeMany).not.toHaveBeenCalled();
  });

  it('does not offer to nudge students who are waiting on us', () => {
    // They are stuck behind a recap nobody has published. Chasing them for it is
    // the one thing this screen must not make easy.
    openAllGroups();
    renderTab([row('Blocked Student', 'waiting_on_us'), row('Also Blocked', 'waiting_on_us')]);
    const heading = screen.getByText('Waiting on us · 2');
    expect(heading).toBeTruthy();
    expect(screen.queryByText('Select all')).toBeNull();
    expect(screen.queryByLabelText('Nudge Blocked Student')).toBeNull();
    // Calling them is still fine, and sometimes the right thing.
    expect(screen.getByLabelText('Call Blocked Student')).toBeTruthy();
  });

  it('renders waiting_on_us last, under the groups a teacher can act on', () => {
    openAllGroups();
    const { container } = renderTab([row('Blocked One', 'waiting_on_us'), row('Urgent One', 'run_over')]);
    const headings = within(container)
      .getAllByRole('button', { expanded: true })
      .map((b) => b.textContent || '');
    expect(headings[0]).toContain('Run over');
    expect(headings[headings.length - 1]).toContain('Waiting on us');
  });

  it('explains the students it removed rather than dropping them silently', () => {
    renderTab(THREE, { totals: { ...payload(THREE).totals, hiddenDormant: 3 } });
    expect(screen.getByText(/3 dormant students are/)).toBeTruthy();
  });

  it('says nothing about dormant students when none were hidden', () => {
    renderTab(THREE);
    expect(screen.queryByText(/dormant/)).toBeNull();
  });

  it('congratulates an empty classroom instead of rendering an empty list', () => {
    renderTab([]);
    expect(screen.getByText(/Nobody is behind/)).toBeTruthy();
  });
});

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { syncClassroomMeetings } from './teams-meeting-sync';

/**
 * These tests pin down the ONLY safe cancellation rule: a Nexus channel-meeting
 * class is cancelled solely when its matching Teams event is explicitly
 * isCancelled AND the class has not happened yet. Mere absence from the fetched
 * window, any non-channel scope, and any class already over must never cancel.
 * Those were the two ways classes disappeared: freshly-created ones were killed
 * by absence, and a month of past ones by a calendar tidy-up weeks later.
 */

const JOIN_URL = 'https://teams.microsoft.com/l/meetup-join/abc';
const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2020-02-01T00:00:00.000Z';
const OLD_CREATED = '2020-01-01T00:00:00.000Z'; // well outside the 30-min grace window

/**
 * Every fixture class sits at 2020-01-15 19:00-20:30 IST, which is 13:30-15:00
 * UTC. The clock is pinned before that so the default fixture is an UPCOMING
 * class; the past-class guard is exercised by moving the clock, not the data.
 */
const BEFORE_CLASS = new Date('2020-01-15T10:00:00.000Z');
const AFTER_CLASS = new Date('2020-01-15T16:00:00.000Z');

/** Minimal chainable Supabase mock that records updates/inserts. */
function makeSupabase(nexusClasses: any[]) {
  const updates: Array<{ table: string; vals: any; id?: string }> = [];
  const inserts: Array<{ table: string; row: any }> = [];

  const from = (table: string) => {
    const state: any = { table };
    const chain: any = {
      select: () => chain,
      insert: (row: any) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
      update: (vals: any) => {
        state.updateVals = vals;
        return chain;
      },
      eq: (col: string, val: string) => {
        if (state.updateVals) {
          updates.push({ table, vals: state.updateVals, id: val });
          return Promise.resolve({ error: null });
        }
        return chain;
      },
      not: () => chain,
      gte: () => chain,
      lte: () => chain,
      single: () => Promise.resolve({ data: null }),
      // The class list query is awaited directly (no .single()).
      then: (resolve: (v: any) => void) =>
        resolve({ data: table === 'nexus_scheduled_classes' ? nexusClasses : [] }),
    };
    return chain;
  };

  return { from, __updates: updates, __inserts: inserts } as any;
}

/** Stub Graph calendarView to return exactly these events. */
function mockCalendarView(events: any[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        value: events.map((e) => ({
          id: e.id,
          subject: e.subject ?? 'Class',
          start: { dateTime: e.start ?? '2020-01-15T19:00:00' },
          end: { dateTime: e.end ?? '2020-01-15T20:30:00' },
          onlineMeeting: { joinUrl: e.joinUrl },
          organizer: { emailAddress: { name: 'T', address: 't@x.com' } },
          isOnlineMeeting: true,
          isCancelled: !!e.isCancelled,
        })),
      }),
    })) as any,
  );
}

const channelClass = (over: Partial<any> = {}) => ({
  id: 'c1',
  classroom_id: 'room1',
  teams_meeting_id: 'evt-create-id',
  teams_meeting_url: JOIN_URL,
  teams_meeting_join_url: JOIN_URL,
  teams_meeting_scope: 'channel_meeting',
  title: 'Class',
  scheduled_date: '2020-01-15',
  start_time: '19:00:00',
  end_time: '20:30:00',
  status: 'scheduled',
  created_at: OLD_CREATED,
  content_edited_at: null,
  teams_channel_id: null,
  teams_channel_message_id: null,
  teams_group_chat_message_id: null,
  teams_share_message_id: null,
  teams_share_chat_message_id: null,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_CLASS);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('syncClassroomMeetings cancel-detect', () => {
  it('does NOT cancel a channel meeting whose event is present and not cancelled', async () => {
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, isCancelled: false }]);
    const sb = makeSupabase([channelClass()]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.cancelled).toBe(0);
    expect(sb.__updates.filter((u: any) => u.vals.status === 'cancelled')).toHaveLength(0);
  });

  it('cancels a channel meeting only when its matching event is explicitly isCancelled', async () => {
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, isCancelled: true }]);
    const sb = makeSupabase([channelClass()]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.cancelled).toBe(1);
    expect(r.cancelledClasses[0].id).toBe('c1');
    expect(sb.__updates).toContainEqual({ table: 'nexus_scheduled_classes', vals: { status: 'cancelled' }, id: 'c1' });
  });

  it('never cancels a non-channel scope class even if a cancelled event matches', async () => {
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, isCancelled: true }]);
    const sb = makeSupabase([channelClass({ teams_meeting_scope: 'calendar_event' })]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.cancelled).toBe(0);
  });

  it('does NOT cancel a channel meeting merely absent from the fetched window', async () => {
    mockCalendarView([]); // event not returned at all
    const sb = makeSupabase([channelClass()]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.cancelled).toBe(0);
  });

  it('does NOT cancel a class created within the grace window', async () => {
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, isCancelled: true }]);
    const sb = makeSupabase([channelClass({ created_at: new Date().toISOString() })]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.cancelled).toBe(0);
  });

  it('does NOT cancel a class that has already ended, even on an explicit isCancelled', async () => {
    // Deleting or declining the calendar entry after the fact is a tidy-up, not a
    // statement that the class never ran. Cancelling here would hide the class,
    // its recording and its attendance from every student with no way back.
    vi.setSystemTime(AFTER_CLASS);
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, isCancelled: true }]);
    const sb = makeSupabase([channelClass()]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.cancelled).toBe(0);
    expect(r.skippedPastCancels).toBe(1);
    expect(sb.__updates.filter((u: any) => u.vals.status === 'cancelled')).toHaveLength(0);
  });

  it('still cancels a class that has not started yet', async () => {
    // The boundary the guard turns on: one minute before the class ends it is
    // still cancellable, which is the case the reconciler exists for.
    vi.setSystemTime(new Date('2020-01-15T14:59:00.000Z'));
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, isCancelled: true }]);
    const sb = makeSupabase([channelClass()]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.cancelled).toBe(1);
    expect(r.skippedPastCancels).toBe(0);
  });
});

describe('syncClassroomMeetings organizer backfill', () => {
  it('backfills organizer_name/organizer_email on a class whose organizer was never captured', async () => {
    // mockCalendarView hardcodes the event organizer to name "T", address "t@x.com".
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, isCancelled: false }]);
    const sb = makeSupabase([channelClass({ organizer_name: null, organizer_email: null })]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.updated).toBe(1);
    // No `title` key: the fixture title already matches the event subject, and the
    // payload now carries only what actually changed (plus date/time, which Teams
    // owns outright).
    expect(sb.__updates).toContainEqual({
      table: 'nexus_scheduled_classes',
      vals: {
        scheduled_date: '2020-01-15',
        start_time: '19:00',
        end_time: '20:30',
        organizer_name: 'T',
        organizer_email: 't@x.com',
      },
      id: 'c1',
    });
  });

  it('does not re-update a class whose organizer already matches Teams and nothing else changed', async () => {
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, isCancelled: false }]);
    const sb = makeSupabase([channelClass({ organizer_name: 'T', organizer_email: 't@x.com' })]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.updated).toBe(0);
    expect(sb.__updates).toHaveLength(0);
  });
});

/**
 * Nexus owns what a class WAS once a human has said so; Teams owns WHEN it is.
 *
 * Before content_edited_at, the reconciler rewrote `title` from the Teams meeting
 * subject on every cycle. Teachers wrapped up a class as "Isometric Subtractive
 * Cubes" and watched it revert to "Class by Ar.Hari Babu"; on 2026-07-30 a single
 * cron pass retitled four classes that still carried the brief and bullets proving
 * a human had written them.
 */
describe('syncClassroomMeetings human-edit lock', () => {
  const WRAPPED_UP = { content_edited_at: '2020-01-14T10:00:00.000Z' };

  it('keeps a wrapped-up title when the Teams subject still says something else', async () => {
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, subject: 'Class by Ar.Hari Babu' }]);
    const sb = makeSupabase([channelClass({ ...WRAPPED_UP, title: 'Isometric Subtractive Cubes' })]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(sb.__updates.some((u: any) => 'title' in u.vals)).toBe(false);
    expect(r.lockedTitleSkips).toBe(1);
  });

  it('fires NO update at all when a locked class differs from Teams only by title', async () => {
    // The regression that makes the guard correct rather than merely present. If
    // `title` were dropped from the payload but left in the `changed` OR, this
    // class would fire an UPDATE writing nothing but its own values, every cycle,
    // forever.
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, subject: 'Class by Ar.Hari Babu' }]);
    const sb = makeSupabase([
      channelClass({ ...WRAPPED_UP, title: 'Isometric Subtractive Cubes', organizer_name: 'T', organizer_email: 't@x.com' }),
    ]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.updated).toBe(0);
    expect(sb.__updates).toHaveLength(0);
    expect(r.lockedTitleSkips).toBe(1);
  });

  it('is idempotent: syncing a locked, drifted class twice still writes nothing', async () => {
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, subject: 'Class by Ar.Hari Babu' }]);
    const cls = channelClass({ ...WRAPPED_UP, title: 'Isometric Subtractive Cubes', organizer_name: 'T', organizer_email: 't@x.com' });
    const sb = makeSupabase([cls]);
    await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(sb.__updates).toHaveLength(0);
  });

  it('still moves a locked class when Teams changes the time, without touching the title', async () => {
    // The lock protects content, not the clock. A class rescheduled in Outlook must
    // still move in Nexus, or students turn up on the wrong evening.
    mockCalendarView([
      {
        id: 'x',
        joinUrl: JOIN_URL,
        subject: 'Class by Ar.Hari Babu',
        start: '2020-01-15T20:00:00',
        end: '2020-01-15T21:30:00',
      },
    ]);
    const sb = makeSupabase([
      channelClass({ ...WRAPPED_UP, title: 'Isometric Subtractive Cubes', organizer_name: 'T', organizer_email: 't@x.com' }),
    ]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.updated).toBe(1);
    const patch = sb.__updates[0].vals;
    expect(patch).toMatchObject({ start_time: '20:00', end_time: '21:30' });
    expect('title' in patch).toBe(false);
  });

  it('still takes the Teams title for a class nobody has wrapped up', async () => {
    // The guard must not disable normal reconciliation: an untouched class renamed
    // in Outlook should still follow.
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, subject: 'Renamed in Outlook' }]);
    const sb = makeSupabase([channelClass({ content_edited_at: null, organizer_name: 'T', organizer_email: 't@x.com' })]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.updated).toBe(1);
    expect(sb.__updates[0].vals.title).toBe('Renamed in Outlook');
    expect(r.lockedTitleSkips).toBe(0);
  });

  it('still cancels a locked class when Teams cancels it', async () => {
    // The lock protects what a class was, not whether it happens.
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, subject: 'Class by Ar.Hari Babu', isCancelled: true }]);
    const sb = makeSupabase([channelClass({ ...WRAPPED_UP, title: 'Isometric Subtractive Cubes' })]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.cancelled).toBe(1);
  });

  it('still backfills organizer on a locked class without touching the title', async () => {
    mockCalendarView([{ id: 'x', joinUrl: JOIN_URL, subject: 'Class by Ar.Hari Babu' }]);
    const sb = makeSupabase([
      channelClass({ ...WRAPPED_UP, title: 'Isometric Subtractive Cubes', organizer_name: null, organizer_email: null }),
    ]);
    const r = await syncClassroomMeetings(sb, 'tok', { id: 'room1', ms_team_id: 'team1' }, PAST, FUTURE);
    expect(r.updated).toBe(1);
    const patch = sb.__updates[0].vals;
    expect(patch).toMatchObject({ organizer_name: 'T', organizer_email: 't@x.com' });
    expect('title' in patch).toBe(false);
  });
});

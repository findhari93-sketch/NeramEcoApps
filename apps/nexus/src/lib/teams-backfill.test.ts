import { describe, it, expect } from 'vitest';
import {
  canonicalJoinUrl,
  planBackfill,
  buildBackfillRow,
  planMetadataRepair,
  type ExistingClassRow,
  type PlannedRow,
} from './teams-backfill';
import type { TeamsCalendarEvent } from './teams-meeting-sync';
import type { RecordingFile } from './channel-recordings';

const THREAD = 'EMRG-7AiVM6ZpFfIf2rBGeFbPMeMC-BZHE8m8EUeaaU1';
const encodedUrl = (epoch: string) =>
  `https://teams.microsoft.com/l/meetup-join/19%3a${THREAD}%40thread.tacv2/${epoch}?context=%7b%22Tid%22%3a%2234f1037a%22%2c%22Oid%22%3a%22f51c6475-0c5e-4ba5-9876-474668f381ec%22%7d`;
const decodedUrl = (epoch: string) =>
  `https://teams.microsoft.com/l/meetup-join/19:${THREAD}@thread.tacv2/${epoch}`;

function event(over: Partial<TeamsCalendarEvent> = {}): TeamsCalendarEvent {
  return {
    id: 'AAMk-evt-1',
    joinUrl: encodedUrl('1784526278019'),
    isCancelled: false,
    subject: 'Class by Ar Hari Babu',
    start: '2026-07-20T19:00:00',
    end: '2026-07-20T20:00:00',
    organizerName: '2027 Future Architects | NeramClasses',
    organizerEmail: 'team@neramclasses.com',
    bodyContent: '<p>Perspective drawing</p>',
    ...over,
  };
}

function existingRow(over: Partial<ExistingClassRow> = {}): ExistingClassRow {
  return {
    id: 'row-1',
    title: 'Class by Ar Hari Babu',
    teams_meeting_id: 'AAMk-evt-1',
    teams_meeting_join_url: decodedUrl('1784526278019'),
    teams_meeting_url: decodedUrl('1784526278019'),
    scheduled_date: '2026-07-20',
    start_time: '19:00:00',
    end_time: '20:00:00',
    status: 'scheduled',
    publish_state: 'published',
    recording_url: null,
    attendance_sync_status: null,
    attendance_sync_attempts: 0,
    attendance_synced_at: null,
    teacher_id: 'teacher-hari',
    organizer_ms_oid: 'f51c6475-0c5e-4ba5-9876-474668f381ec',
    organizer_name: '2027 Future Architects | NeramClasses',
    organizer_email: 'team@neramclasses.com',
    ...over,
  };
}

function recording(name: string, createdDateTime: string): RecordingFile {
  return { name, createdDateTime, webUrl: `https://sp/${encodeURIComponent(name)}`, size: 1 };
}

describe('canonicalJoinUrl', () => {
  it('treats the encoded and decoded forms of one meeting as equal', () => {
    expect(canonicalJoinUrl(encodedUrl('1784526278019'))).toBe(
      canonicalJoinUrl(decodedUrl('1784526278019')),
    );
  });

  it('keeps two meetings in the same thread distinct', () => {
    expect(canonicalJoinUrl(encodedUrl('1784526278019'))).not.toBe(
      canonicalJoinUrl(encodedUrl('1784707344096')),
    );
  });

  it('drops the context tail and a trailing slash', () => {
    expect(canonicalJoinUrl(`${decodedUrl('123')}/?context=%7b%7d`)).toBe(decodedUrl('123'));
  });

  it('returns null for nothing', () => {
    expect(canonicalJoinUrl(null)).toBeNull();
    expect(canonicalJoinUrl('')).toBeNull();
  });
});

describe('planBackfill', () => {
  it('matches an already-imported class by event id', () => {
    const { rows, orphans } = planBackfill([event()], [], [existingRow()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('exists_by_event_id');
    expect(rows[0].existing_class_id).toBe('row-1');
    expect(orphans).toHaveLength(0);
  });

  it('matches by join URL when the stored event id has drifted', () => {
    const existing = [existingRow({ teams_meeting_id: 'AQMk-stale' })];
    const { rows } = planBackfill([event()], [], existing);
    expect(rows[0].action).toBe('exists_by_join_url');
    expect(rows[0].matched_on).toBe('join_url');
  });

  it('falls back to the date and slot when neither id nor URL matches', () => {
    const existing = [
      existingRow({
        teams_meeting_id: 'AQMk-stale',
        teams_meeting_join_url: null,
        teams_meeting_url: null,
      }),
    ];
    const { rows } = planBackfill([event()], [], existing);
    expect(rows[0].action).toBe('exists_by_slot');
  });

  it('imports an event with no Nexus row behind it', () => {
    const { rows } = planBackfill([event()], [], []);
    expect(rows[0].action).toBe('import');
    expect(rows[0].existing_class_id).toBeNull();
  });

  it('never imports a cancelled event', () => {
    const { rows } = planBackfill([event({ isCancelled: true })], [], []);
    expect(rows[0].action).toBe('skip_cancelled');
  });

  it('reports a Nexus class with no Teams event as an orphan and nothing more', () => {
    const stray = existingRow({ id: 'row-stray', scheduled_date: '2026-07-02', teams_meeting_id: 'other' });
    const { rows, orphans } = planBackfill([event()], [], [existingRow(), stray]);
    expect(orphans.map((o) => o.id)).toEqual(['row-stray']);
    expect(rows.every((r) => r.action !== 'skip_cancelled' || !r.existing_class_id)).toBe(true);
    // No action in the vocabulary cancels anything.
    expect(rows.some((r) => (r.action as string) === 'cancel')).toBe(false);
  });

  it('discovers a Meet-now class from the Recordings folder alone', () => {
    const files = [recording('Perspective drill-20260703_183000-Meeting Recording.mp4', '2026-07-03T13:20:00Z')];
    const { rows } = planBackfill([], files, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'recording',
      action: 'import',
      subject: 'Perspective drill',
      scheduled_date: '2026-07-03',
      start_time: '18:30',
      end_time: '20:00',
      duration_estimated: true,
      event_id: null,
    });
  });

  it('does not double up when a recording belongs to a calendar event', () => {
    const files = [
      recording('Class by Ar Hari Babu-20260720_190000-Meeting Recording.mp4', '2026-07-20T14:00:00Z'),
    ];
    const { rows } = planBackfill([event()], files, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('calendar');
  });

  it('does not double up when a recording belongs to an existing Nexus class', () => {
    const files = [
      recording('Class by Ar Hari Babu-20260720_190000-Meeting Recording.mp4', '2026-07-20T14:00:00Z'),
    ];
    const { rows } = planBackfill([], files, [existingRow()]);
    expect(rows).toHaveLength(0);
  });

  it('orders rows by start time', () => {
    const later = event({ id: 'evt-2', joinUrl: encodedUrl('9'), start: '2026-07-22T19:00:00', end: '2026-07-22T20:00:00' });
    const earlier = event({ id: 'evt-3', joinUrl: encodedUrl('8'), start: '2026-07-16T19:00:00', end: '2026-07-16T20:00:00' });
    const { rows } = planBackfill([later, earlier], [], []);
    expect(rows.map((r) => r.scheduled_date)).toEqual(['2026-07-16', '2026-07-22']);
  });
});

describe('buildBackfillRow', () => {
  const ctx = {
    classroomId: '8876a8fc-ac99-4091-b3b2-15f93723c642',
    classroomType: 'common',
    teacherId: 'fe02a591-dd77-4459-a0ae-d281539278c3',
    organizerOid: 'f51c6475-0c5e-4ba5-9876-474668f381ec',
    channelThreadId: `19:${THREAD}@thread.tacv2`,
    now: '2026-07-26T10:00:00.000Z',
  };

  const calendarRow = (): PlannedRow => planBackfill([event()], [], []).rows[0];

  it('publishes immediately, with published_at set', () => {
    const payload = buildBackfillRow(calendarRow(), ctx);
    expect(payload.publish_state).toBe('published');
    expect(payload.published_at).toBe(ctx.now);
  });

  it('keeps IST wall clock for a late-evening class on the last day of the month', () => {
    const lateEvent = event({ start: '2026-07-31T23:00:00', end: '2026-07-31T23:59:00' });
    const row = planBackfill([lateEvent], [], []).rows[0];
    const payload = buildBackfillRow(row, ctx);
    expect(payload.scheduled_date).toBe('2026-07-31');
    expect(payload.start_time).toBe('23:00');
  });

  it('carries the meeting identifiers a later attendance sync needs', () => {
    const payload = buildBackfillRow(calendarRow(), ctx);
    expect(payload.teams_meeting_id).toBe('AAMk-evt-1');
    expect(payload.teams_meeting_scope).toBe('channel_meeting');
    expect(payload.organizer_ms_oid).toBe(ctx.organizerOid);
    expect(payload.teams_channel_id).toBe(ctx.channelThreadId);
    expect(payload.description).toBe('Perspective drawing');
  });

  it('sends a common classroom to every student', () => {
    expect(buildBackfillRow(calendarRow(), ctx).target_scope).toBe('all');
    expect(buildBackfillRow(calendarRow(), { ...ctx, classroomType: 'nata' }).target_scope).toBe(
      'classroom',
    );
  });

  it('attaches the recording and no meeting id for a recording-only class', () => {
    const files = [recording('Perspective drill-20260703_183000-Meeting Recording.mp4', '2026-07-03T13:20:00Z')];
    const row = planBackfill([], files, []).rows[0];
    const payload = buildBackfillRow(row, ctx);
    expect(payload.recording_url).toBe(files[0].webUrl);
    expect(payload.teams_meeting_id).toBeUndefined();
    expect(payload.recording_fetched_at).toBe(ctx.now);
  });

  it("prefers the row's own organizer over the window-wide fallback", () => {
    // Prod really does mix organizers inside one channel: the 3 July class was
    // set up by a different person from the rest of that month. Stamping one
    // organizer across the window sends attendance to the wrong mailbox.
    const otherOid = '6b7a60f1-3646-47a3-b7dc-4ab050912622';
    const url =
      `https://teams.microsoft.com/l/meetup-join/19%3a${THREAD}%40thread.tacv2/1783082279456` +
      `?context=%7b%22Tid%22%3a%2234f1037a%22%2c%22Oid%22%3a%22${otherOid}%22%7d`;
    const row = planBackfill([event({ joinUrl: url })], [], []).rows[0];
    expect(buildBackfillRow(row, ctx).organizer_ms_oid).toBe(otherOid);
  });
});

describe('status reconciliation', () => {
  it('flags a class cancelled in Nexus while Teams still lists it', () => {
    const { rows } = planBackfill([event()], [], [existingRow({ status: 'cancelled' })]);
    expect(rows[0].existing_status).toBe('cancelled');
    expect(rows[0].status_fix).toBe('restore');
  });

  it('flags the opposite direction separately, so it can stay opt-in', () => {
    const { rows } = planBackfill(
      [event({ isCancelled: true })],
      [],
      [existingRow({ status: 'scheduled' })],
    );
    expect(rows[0].status_fix).toBe('cancel_in_nexus');
  });

  it('reports no fix when the two already agree', () => {
    expect(planBackfill([event()], [], [existingRow()]).rows[0].status_fix).toBeNull();
    expect(
      planBackfill([event({ isCancelled: true })], [], [existingRow({ status: 'cancelled' })])
        .rows[0].status_fix,
    ).toBeNull();
  });

  it('never proposes a fix for a class that is not in Nexus at all', () => {
    const { rows } = planBackfill([event()], [], []);
    expect(rows[0].action).toBe('import');
    expect(rows[0].status_fix).toBeNull();
    expect(rows[0].existing_status).toBeNull();
  });
});

describe('planMetadataRepair', () => {
  const rowFor = (over: Partial<TeamsCalendarEvent> = {}): PlannedRow =>
    planBackfill([event(over)], [], []).rows[0];

  it('fills only the columns that are null', () => {
    const repair = planMetadataRepair(
      rowFor(),
      existingRow({ organizer_ms_oid: null, teacher_id: null }),
      { teacherId: 'teacher-new' },
    );
    expect(repair).toEqual({
      organizer_ms_oid: 'f51c6475-0c5e-4ba5-9876-474668f381ec',
      teacher_id: 'teacher-new',
    });
  });

  it('never overwrites a teacher someone already set', () => {
    // A hand-picked tutor is a better record of who taught than anything the
    // calendar knows, and the calendar does not model a tutor at all.
    const repair = planMetadataRepair(rowFor(), existingRow({ teacher_id: 'teacher-hari' }), {
      teacherId: 'someone-else',
    });
    expect(repair.teacher_id).toBeUndefined();
  });

  it('returns nothing to do for a fully populated row', () => {
    expect(planMetadataRepair(rowFor(), existingRow(), { teacherId: 'x' })).toEqual({});
  });

  it('leaves teacher_id alone when no teacher was chosen', () => {
    const repair = planMetadataRepair(rowFor(), existingRow({ teacher_id: null }), {});
    expect(repair.teacher_id).toBeUndefined();
  });
});

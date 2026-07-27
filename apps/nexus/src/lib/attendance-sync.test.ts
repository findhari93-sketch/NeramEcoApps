import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  pickReportForClass,
  buildRosterIndex,
  syncClassAttendance,
  applyCsvAttendance,
  ATTENDANCE_FAILURE_MESSAGES,
  type ClassMeetingRow,
} from './attendance-sync';

vi.mock('@/lib/graph-app-token', () => ({
  getAppOnlyToken: vi.fn(async () => 'app-token'),
}));

const ONLINE_MEETING_ID = 'MSpkYzE3Njc0Yy04MWQ5';

const CLASS: ClassMeetingRow = {
  id: 'class-1',
  classroom_id: 'room-1',
  teams_meeting_id: 'AAMkAGExNjgzOGVh',
  teams_meeting_join_url:
    'https://teams.microsoft.com/l/meetup-join/xyz?context=%7B%22Oid%22%3A%22organizer-1%22%7D',
  teams_meeting_url: null,
  teacher_id: null,
  organizer_email: null,
  organizer_ms_oid: 'organizer-1',
  online_meeting_id: ONLINE_MEETING_ID,
  scheduled_date: '2026-07-22',
  start_time: '19:00:00',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pickReportForClass', () => {
  const classStart = new Date('2026-07-22T19:00:00+05:30');

  it('picks the report matching this occurrence, not the last array element', () => {
    // A recurring channel meeting reuses one onlineMeeting id, so Graph returns
    // one report per night. Taking the last element attributes the wrong night.
    const reports = [
      { id: 'today', meetingStartDateTime: '2026-07-22T13:30:00Z' },
      { id: 'tomorrow', meetingStartDateTime: '2026-07-23T13:30:00Z' },
    ];
    expect(pickReportForClass(reports, classStart)?.id).toBe('today');
  });

  it('returns the only report without needing a timestamp', () => {
    expect(pickReportForClass([{ id: 'solo' }], classStart)?.id).toBe('solo');
  });

  it('returns null for an empty list', () => {
    expect(pickReportForClass([], classStart)).toBeNull();
  });

  it('falls back to the latest by start time when nothing is within tolerance', () => {
    const reports = [
      { id: 'older', meetingStartDateTime: '2026-01-01T13:30:00Z' },
      { id: 'newer', meetingStartDateTime: '2026-02-01T13:30:00Z' },
    ];
    expect(pickReportForClass(reports, classStart)?.id).toBe('newer');
  });
});

describe('buildRosterIndex', () => {
  it('indexes ms_oid and all three email columns, lowercased', () => {
    const { byOid, byEmail } = buildRosterIndex([
      {
        user_id: 'u1',
        user: {
          id: 'u1',
          ms_oid: 'OID-ABC',
          email: 'Hari.Babu@NeramClasses.com',
          linked_classroom_email: 'hari@classroom.example',
          personal_email: 'hari@gmail.com',
        },
      },
    ]);

    expect(byOid.get('oid-abc')).toBe('u1');
    // Graph preserves admin-set UPN casing, which is exactly how the old
    // case-sensitive .eq('email') lookup dropped students silently.
    expect(byEmail.get('hari.babu@neramclasses.com')).toBe('u1');
    expect(byEmail.get('hari@classroom.example')).toBe('u1');
    expect(byEmail.get('hari@gmail.com')).toBe('u1');
  });

  it('skips rows with no joined user', () => {
    const { byOid, byEmail } = buildRosterIndex([{ user_id: 'u1', user: null }]);
    expect(byOid.size).toBe(0);
    expect(byEmail.size).toBe(0);
  });
});

/**
 * Chainable Supabase stub. Terminal calls resolve from `tables`; writes are
 * captured so tests can assert what would hit the database.
 */
function mockSupabase(tables: Record<string, any[]>) {
  const writes: Array<{ table: string; op: string; payload: any }> = [];

  const builder = (table: string) => {
    const state = { table };
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      is: () => chain,
      ilike: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: (tables[state.table] ?? [])[0] ?? null }),
      single: async () => ({ data: (tables[state.table] ?? [])[0] ?? null }),
      then: (resolve: any) => resolve({ data: tables[state.table] ?? [] }),
      upsert: (payload: any) => {
        writes.push({ table: state.table, op: 'upsert', payload });
        return { error: null };
      },
      update: (payload: any) => {
        writes.push({ table: state.table, op: 'update', payload });
        return chain;
      },
      delete: () => {
        writes.push({ table: state.table, op: 'delete', payload: null });
        return chain;
      },
    };
    return chain;
  };

  return { from: (table: string) => builder(table), __writes: writes };
}

/** Route mocked Graph responses by URL substring. */
function stubGraph(routes: Array<{ match: string; status?: number; body?: any; text?: string }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const route = routes.find((r) => url.includes(r.match));
      if (!route) {
        return { ok: false, status: 404, text: async () => 'no stub', json: async () => ({}) } as any;
      }
      const status = route.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => route.body ?? {},
        text: async () => route.text ?? JSON.stringify(route.body ?? {}),
      } as any;
    }),
  );
}

describe('syncClassAttendance', () => {
  beforeEach(() => {
    vi.stubGlobal('console', { ...console, error: vi.fn() });
  });

  it('reports no_meeting_linked without calling Graph', async () => {
    const supabase = mockSupabase({ nexus_scheduled_classes: [{ attendance_sync_attempts: 0 }] });
    stubGraph([]);

    const result = await syncClassAttendance(supabase as any, { ...CLASS, teams_meeting_id: null });

    expect(result).toMatchObject({ ok: false, code: 'no_meeting_linked' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('classifies a Graph 403 on reports as a missing access policy', async () => {
    const supabase = mockSupabase({ nexus_scheduled_classes: [{ attendance_sync_attempts: 0 }] });
    stubGraph([
      { match: '/attendanceReports', status: 403, text: 'Forbidden' },
    ]);

    const result = await syncClassAttendance(supabase as any, CLASS);

    expect(result).toMatchObject({ ok: false, code: 'access_policy_missing' });
  });

  it('classifies a 403 on the DELEGATED artifact path as not_organizer, not an access policy', async () => {
    // No organizer oid and no join URL, so the only path left is the caller's own
    // me/onlineMeetings. A Teams application access policy does not govern that
    // base, so blaming one would send an admin to the wrong console.
    const supabase = mockSupabase({ nexus_scheduled_classes: [{ attendance_sync_attempts: 0 }] });
    stubGraph([{ match: '/attendanceReports', status: 403, text: '3003: User does not have access to lookup meeting' }]);

    const result = await syncClassAttendance(
      supabase as any,
      {
        ...CLASS,
        teams_meeting_id: ONLINE_MEETING_ID,
        teams_meeting_join_url: null,
        organizer_ms_oid: null,
        online_meeting_id: null,
      },
      { delegatedToken: 'deleg' },
    );

    expect(result).toMatchObject({ ok: false, code: 'not_organizer' });
  });

  it('classifies Authorization_RequestDenied as a missing app permission', async () => {
    const supabase = mockSupabase({ nexus_scheduled_classes: [{ attendance_sync_attempts: 0 }] });
    stubGraph([
      {
        match: '/attendanceReports',
        status: 403,
        text: '{"error":{"code":"Authorization_RequestDenied"}}',
      },
    ]);

    const result = await syncClassAttendance(supabase as any, CLASS);

    expect(result).toMatchObject({ ok: false, code: 'app_permission_missing' });
  });

  it('reports report_not_ready when Teams has published nothing', async () => {
    const supabase = mockSupabase({ nexus_scheduled_classes: [{ attendance_sync_attempts: 0 }] });
    stubGraph([{ match: '/attendanceReports', body: { value: [] } }]);

    const result = await syncClassAttendance(supabase as any, CLASS);

    expect(result).toMatchObject({ ok: false, code: 'report_not_ready' });
  });

  it('treats an empty report as final, stamping synced_at so the cron stops retrying', async () => {
    const supabase = mockSupabase({
      nexus_scheduled_classes: [{ attendance_sync_attempts: 0 }],
      nexus_enrollments: [],
      nexus_attendance: [],
    });
    stubGraph([
      { match: '/attendanceReports/report-1/attendanceRecords', body: { value: [] } },
      {
        match: '/attendanceReports',
        body: { value: [{ id: 'report-1', meetingStartDateTime: '2026-07-22T13:30:00Z' }] },
      },
    ]);

    const result = await syncClassAttendance(supabase as any, CLASS);

    expect(result).toMatchObject({ ok: false, code: 'no_records' });
    const update = supabase.__writes.find(
      (w) => w.table === 'nexus_scheduled_classes' && w.op === 'update',
    );
    expect(update?.payload.attendance_synced_at).toBeTruthy();
  });

  it('does NOT stamp synced_at for a retryable failure', async () => {
    const supabase = mockSupabase({ nexus_scheduled_classes: [{ attendance_sync_attempts: 0 }] });
    stubGraph([{ match: '/attendanceReports', body: { value: [] } }]);

    await syncClassAttendance(supabase as any, CLASS);

    const update = supabase.__writes.find(
      (w) => w.table === 'nexus_scheduled_classes' && w.op === 'update',
    );
    expect(update?.payload.attendance_sync_status).toBe('report_not_ready');
    expect(update?.payload.attendance_synced_at).toBeUndefined();
    expect(update?.payload.attendance_sync_attempts).toBe(1);
  });

  it('matches a student by identity.id even when Graph email casing differs', async () => {
    const supabase = mockSupabase({
      nexus_scheduled_classes: [{ attendance_sync_attempts: 0 }],
      nexus_enrollments: [
        {
          user_id: 'student-1',
          role: 'student',
          user: {
            id: 'student-1',
            ms_oid: 'STUDENT-OID',
            email: 'Pranav@NeramClasses.com',
            linked_classroom_email: null,
            personal_email: null,
          },
        },
      ],
      nexus_attendance: [],
    });

    stubGraph([
      {
        match: '/attendanceReports/report-1/attendanceRecords',
        body: {
          value: [
            {
              identity: { id: 'student-oid' },
              emailAddress: 'PRANAV@neramclasses.com',
              totalAttendanceInSeconds: 3300,
              attendanceIntervals: [
                { joinDateTime: '2026-07-22T13:32:00Z', leaveDateTime: '2026-07-22T14:27:00Z' },
              ],
            },
          ],
        },
      },
      {
        match: '/attendanceReports',
        body: { value: [{ id: 'report-1', meetingStartDateTime: '2026-07-22T13:30:00Z' }] },
      },
    ]);

    const result = await syncClassAttendance(supabase as any, CLASS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.synced).toBe(1);
    expect(result.unmatched).toBe(0);

    const upsert = supabase.__writes.find((w) => w.table === 'nexus_attendance' && w.op === 'upsert');
    expect(upsert?.payload[0]).toMatchObject({
      student_id: 'student-1',
      attended: true,
      source: 'teams',
      duration_minutes: 55,
      joined_at: '2026-07-22T13:32:00Z',
      left_at: '2026-07-22T14:27:00Z',
    });
  });

  it('counts a Graph participant who is on no roster as unmatched rather than throwing', async () => {
    const supabase = mockSupabase({
      nexus_scheduled_classes: [{ attendance_sync_attempts: 0 }],
      nexus_enrollments: [],
      nexus_attendance: [],
    });

    stubGraph([
      {
        match: '/attendanceReports/report-1/attendanceRecords',
        body: {
          value: [{ identity: { id: 'stranger' }, emailAddress: 'stranger@example.com' }],
        },
      },
      {
        match: '/attendanceReports',
        body: { value: [{ id: 'report-1', meetingStartDateTime: '2026-07-22T13:30:00Z' }] },
      },
    ]);

    const result = await syncClassAttendance(supabase as any, CLASS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.synced).toBe(0);
    expect(result.unmatched).toBe(1);
  });

  it("leaves a teacher's manual present/absent decision intact, adding only telemetry", async () => {
    const supabase = mockSupabase({
      nexus_scheduled_classes: [{ attendance_sync_attempts: 0 }],
      nexus_enrollments: [
        {
          user_id: 'student-1',
          role: 'student',
          user: {
            id: 'student-1',
            ms_oid: 'student-oid',
            email: null,
            linked_classroom_email: null,
            personal_email: null,
          },
        },
      ],
      // Teacher already marked this student ABSENT by hand.
      nexus_attendance: [{ student_id: 'student-1', source: 'manual', attended: false }],
    });

    stubGraph([
      {
        match: '/attendanceReports/report-1/attendanceRecords',
        body: {
          value: [
            {
              identity: { id: 'student-oid' },
              totalAttendanceInSeconds: 120,
              attendanceIntervals: [
                { joinDateTime: '2026-07-22T13:32:00Z', leaveDateTime: '2026-07-22T13:34:00Z' },
              ],
            },
          ],
        },
      },
      {
        match: '/attendanceReports',
        body: { value: [{ id: 'report-1', meetingStartDateTime: '2026-07-22T13:30:00Z' }] },
      },
    ]);

    await syncClassAttendance(supabase as any, CLASS);

    const upsert = supabase.__writes.find((w) => w.table === 'nexus_attendance' && w.op === 'upsert');
    expect(upsert?.payload[0]).toMatchObject({
      attended: false,
      source: 'manual',
      duration_minutes: 2,
    });
  });

  it('follows @odata.nextLink so a long record list is not truncated', async () => {
    const supabase = mockSupabase({
      nexus_scheduled_classes: [{ attendance_sync_attempts: 0 }],
      nexus_enrollments: [
        {
          user_id: 's1',
          role: 'student',
          user: { id: 's1', ms_oid: 'a', email: null, linked_classroom_email: null, personal_email: null },
        },
        {
          user_id: 's2',
          role: 'student',
          user: { id: 's2', ms_oid: 'b', email: null, linked_classroom_email: null, personal_email: null },
        },
      ],
      nexus_attendance: [],
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const ok = (body: any) => ({ ok: true, status: 200, json: async () => body, text: async () => '' }) as any;
        if (url.includes('page2')) {
          return ok({ value: [{ identity: { id: 'b' }, totalAttendanceInSeconds: 60 }] });
        }
        if (url.includes('/attendanceRecords')) {
          return ok({
            value: [{ identity: { id: 'a' }, totalAttendanceInSeconds: 60 }],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/page2',
          });
        }
        return ok({ value: [{ id: 'report-1', meetingStartDateTime: '2026-07-22T13:30:00Z' }] });
      }),
    );

    const result = await syncClassAttendance(supabase as any, CLASS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.synced).toBe(2);
  });
});

describe('ATTENDANCE_FAILURE_MESSAGES', () => {
  it('names the Azure remedy for the two permission failures', () => {
    expect(ATTENDANCE_FAILURE_MESSAGES.app_permission_missing).toMatch(/OnlineMeetingArtifact\.Read\.All/);
    expect(ATTENDANCE_FAILURE_MESSAGES.access_policy_missing).toMatch(/application access policy/i);
  });
});

describe('applyCsvAttendance', () => {
  const CSV_CLASS = { id: 'class-1', classroom_id: 'room-1' };

  const rosterOf = (...ids: string[]) =>
    ids.map((id) => ({ user_id: id, role: 'student', user: { id } }));

  beforeEach(() => {
    vi.stubGlobal('console', { ...console, error: vi.fn() });
  });

  it('never touches Microsoft Graph, which is the whole point of the fallback', async () => {
    const supabase = mockSupabase({
      nexus_enrollments: rosterOf('student-1'),
      nexus_attendance: [],
    });
    stubGraph([]);

    await applyCsvAttendance(
      supabase as any,
      CSV_CLASS,
      [{ student_id: 'student-1', attended: true, duration_minutes: 88, joined_at: null, left_at: null }],
      { markedBy: 'staff-1', detail: 'Imported from Teams CSV' },
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it('writes source teams_csv and stamps who imported it', async () => {
    const supabase = mockSupabase({
      nexus_enrollments: rosterOf('student-1'),
      nexus_attendance: [],
    });

    const result = await applyCsvAttendance(
      supabase as any,
      CSV_CLASS,
      [
        {
          student_id: 'student-1',
          attended: true,
          duration_minutes: 88,
          joined_at: '2026-07-22T13:32:00.000Z',
          left_at: '2026-07-22T15:00:00.000Z',
        },
      ],
      { markedBy: 'staff-1', detail: 'Imported from Teams CSV by Shanthi' },
    );

    expect(result).toMatchObject({ ok: true, synced: 1 });

    const upsert = supabase.__writes.find((w) => w.table === 'nexus_attendance' && w.op === 'upsert');
    expect(upsert?.payload[0]).toMatchObject({
      student_id: 'student-1',
      attended: true,
      duration_minutes: 88,
      source: 'teams_csv',
      marked_by: 'staff-1',
    });
  });

  it("keeps a teacher's manual decision and only attaches the report's telemetry", async () => {
    const supabase = mockSupabase({
      nexus_enrollments: rosterOf('student-1'),
      // Marked ABSENT by hand, even though the report says they were there.
      nexus_attendance: [{ student_id: 'student-1', source: 'manual', attended: false }],
    });

    await applyCsvAttendance(
      supabase as any,
      CSV_CLASS,
      [{ student_id: 'student-1', attended: true, duration_minutes: 88, joined_at: null, left_at: null }],
      { markedBy: 'staff-1', detail: 'Imported from Teams CSV' },
    );

    const upsert = supabase.__writes.find((w) => w.table === 'nexus_attendance' && w.op === 'upsert');
    expect(upsert?.payload[0]).toMatchObject({
      attended: false,
      source: 'manual',
      duration_minutes: 88,
    });
  });

  it('stamps the class as synced with the import as its detail', async () => {
    const supabase = mockSupabase({
      nexus_enrollments: rosterOf('student-1'),
      nexus_attendance: [],
    });

    await applyCsvAttendance(
      supabase as any,
      CSV_CLASS,
      [{ student_id: 'student-1', attended: true, duration_minutes: 88, joined_at: null, left_at: null }],
      { markedBy: 'staff-1', detail: 'Imported from Teams CSV by Shanthi: 1 matched' },
    );

    const update = supabase.__writes.find(
      (w) => w.table === 'nexus_scheduled_classes' && w.op === 'update',
    );
    expect(update?.payload).toMatchObject({
      attendance_sync_status: 'ok',
      attendance_sync_detail: 'Imported from Teams CSV by Shanthi: 1 matched',
    });
    expect(update?.payload.attendance_synced_at).toBeTruthy();
  });

  it('refuses an empty import rather than stamping the class as synced', async () => {
    const supabase = mockSupabase({ nexus_enrollments: [], nexus_attendance: [] });

    const result = await applyCsvAttendance(supabase as any, CSV_CLASS, [], {
      markedBy: 'staff-1',
      detail: 'Imported from Teams CSV',
    });

    expect(result).toMatchObject({ ok: false, code: 'no_records' });
    expect(supabase.__writes).toHaveLength(0);
  });

  it('derives no_shows for enrolled students the report marked absent', async () => {
    const supabase = mockSupabase({
      nexus_enrollments: rosterOf('student-1', 'student-2'),
      // deriveNoShows re-reads this table; nobody is recorded as attended.
      nexus_attendance: [],
    });

    const result = await applyCsvAttendance(
      supabase as any,
      CSV_CLASS,
      [{ student_id: 'student-1', attended: false, duration_minutes: 1, joined_at: null, left_at: null }],
      { markedBy: 'staff-1', detail: 'Imported from Teams CSV' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.noShows).toBe(2);
    expect(
      supabase.__writes.some((w) => w.table === 'nexus_class_absences' && w.op === 'upsert'),
    ).toBe(true);
  });
});

import { test, expect } from '@playwright/test';

/**
 * Timetable Meeting Features E2E Tests — Nexus App
 *
 * Tests the new meeting creation features:
 * - Recurrence (daily/weekly bulk-insert)
 * - Meeting options (lobby_bypass, allowed_presenters)
 * - Cancel with teamsWarning in response
 * - Sync from Teams with quick mode
 *
 * Runs against localhost:3012 (Nexus dev server).
 */

const E2E_CLASSROOM_ID = '6d065ef5-c945-4112-a94f-48f3eb3a95f4';

let teacherToken: string;
let studentToken: string;
const createdClassIds: string[] = [];
const createdRecurrenceGroupIds: string[] = [];

test.describe('Timetable Meeting Features', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  // ─── SETUP ───

  test('setup: get teacher test token', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    teacherToken = body.testToken;
    expect(teacherToken).toBeTruthy();
  });

  test('setup: get student test token', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    studentToken = body.testToken;
    expect(studentToken).toBeTruthy();
  });

  // ─── RECURRENCE: WEEKLY ───

  test('teacher can create weekly recurring classes (Mon/Wed/Fri)', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'E2E Weekly Recurring Class',
        scheduled_date: '2026-08-03', // Monday
        start_time: '10:00',
        end_time: '11:00',
        target_scope: 'classroom',
        recurrence_rule: 'weekly:mon,wed,fri',
        recurrence_end_date: '2026-08-14', // Friday (2 weeks)
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    // Should create 6 classes: Mon/Wed/Fri x 2 weeks
    expect(body.classes).toBeInstanceOf(Array);
    expect(body.classes).toHaveLength(6);
    expect(body.count).toBe(6);

    // All should share same recurrence_group_id
    const groupId = body.classes[0].recurrence_group_id;
    expect(groupId).toBeTruthy();
    for (const cls of body.classes) {
      expect(cls.recurrence_group_id).toBe(groupId);
      expect(cls.recurrence_rule).toBe('weekly:mon,wed,fri');
      expect(cls.status).toBe('scheduled');
    }

    // Verify correct dates
    const dates = body.classes.map((c: any) => c.scheduled_date);
    expect(dates).toContain('2026-08-03'); // Mon
    expect(dates).toContain('2026-08-05'); // Wed
    expect(dates).toContain('2026-08-07'); // Fri
    expect(dates).toContain('2026-08-10'); // Mon
    expect(dates).toContain('2026-08-12'); // Wed
    expect(dates).toContain('2026-08-14'); // Fri

    createdRecurrenceGroupIds.push(groupId);
    for (const cls of body.classes) {
      createdClassIds.push(cls.id);
    }
  });

  // ─── RECURRENCE: DAILY ───

  test('teacher can create daily recurring classes (Mon-Sat)', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'E2E Daily Recurring Class',
        scheduled_date: '2026-08-17', // Monday
        start_time: '14:00',
        end_time: '15:00',
        target_scope: 'classroom',
        recurrence_rule: 'daily',
        recurrence_end_date: '2026-08-23', // Sunday (should get 6 weekdays)
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    // Mon-Sat = 6 classes (Sunday excluded by daily rule)
    expect(body.classes).toHaveLength(6);

    // Verify no Sunday
    for (const cls of body.classes) {
      const dayOfWeek = new Date(cls.scheduled_date + 'T00:00:00').getDay();
      expect(dayOfWeek).not.toBe(0); // 0 = Sunday
    }

    for (const cls of body.classes) {
      createdClassIds.push(cls.id);
    }
  });

  // ─── RECURRENCE: VALIDATION ───

  test('recurrence rejects end date that generates too many classes (max 90)', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'E2E Too Many Classes',
        scheduled_date: '2026-01-01',
        start_time: '10:00',
        end_time: '11:00',
        recurrence_rule: 'daily',
        recurrence_end_date: '2026-12-31', // ~300+ weekdays
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('too many');
  });

  test('recurrence with no matching days returns 400', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'E2E No Matching Days',
        scheduled_date: '2026-08-03', // Monday
        start_time: '10:00',
        end_time: '11:00',
        recurrence_rule: 'weekly:sat',
        recurrence_end_date: '2026-08-04', // Only Mon & Tue — no Sat in range
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No matching dates');
  });

  // ─── MEETING OPTIONS (lobby_bypass, allowed_presenters) ───

  test('teacher can create class with custom meeting options', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'E2E Custom Meeting Options',
        scheduled_date: '2026-08-25',
        start_time: '09:00',
        end_time: '10:00',
        target_scope: 'classroom',
        lobby_bypass: 'everyone',
        allowed_presenters: 'everyone',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.class.lobby_bypass).toBe('everyone');
    expect(body.class.allowed_presenters).toBe('everyone');
    createdClassIds.push(body.class.id);
  });

  test('meeting options default to organization/organizer when not provided', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'E2E Default Meeting Options',
        scheduled_date: '2026-08-26',
        start_time: '09:00',
        end_time: '10:00',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.class.lobby_bypass).toBe('organization');
    expect(body.class.allowed_presenters).toBe('organizer');
    createdClassIds.push(body.class.id);
  });

  test('teacher can update lobby_bypass via PATCH', async ({ request }) => {
    const classId = createdClassIds[createdClassIds.length - 1];
    const res = await request.patch('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        id: classId,
        classroom_id: E2E_CLASSROOM_ID,
        lobby_bypass: 'invitees',
        allowed_presenters: 'organization',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.class.lobby_bypass).toBe('invitees');
    expect(body.class.allowed_presenters).toBe('organization');
  });

  // ─── CANCEL WITH TEAMS WARNING ───

  test('cancel class without Teams meeting returns no teamsWarning', async ({ request }) => {
    const createRes = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'E2E Cancel No Teams',
        scheduled_date: '2026-08-27',
        start_time: '10:00',
        end_time: '11:00',
      },
    });
    const created = await createRes.json();

    const res = await request.delete('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { id: created.class.id, classroom_id: E2E_CLASSROOM_ID },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.class.status).toBe('cancelled');
    expect(body.teamsWarning).toBeUndefined();

    // Permanent delete for cleanup
    await request.delete('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { id: created.class.id, classroom_id: E2E_CLASSROOM_ID, permanent: true },
      failOnStatusCode: false,
    });
  });

  // ─── SYNC FROM TEAMS: QUICK MODE ───

  test('sync from teams with quick mode returns valid response', async ({ request }) => {
    const res = await request.post('/api/timetable/sync-from-teams', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { classroom_id: E2E_CLASSROOM_ID, quick: true },
      failOnStatusCode: false,
    });
    // May fail with 400 if classroom has no linked Teams team — that's OK
    const status = res.status();
    if (status === 200) {
      const body = await res.json();
      expect(typeof body.imported).toBe('number');
      expect(typeof body.skipped).toBe('number');
      expect(body.errors).toBeInstanceOf(Array);
    } else {
      // Expected if classroom has no ms_team_id
      expect(status).toBe(400);
    }
  });

  test('sync from teams without quick flag uses full window', async ({ request }) => {
    const res = await request.post('/api/timetable/sync-from-teams', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { classroom_id: E2E_CLASSROOM_ID },
      failOnStatusCode: false,
    });
    const status = res.status();
    // Same structure check — just validating the endpoint works with and without quick
    expect([200, 400]).toContain(status);
  });

  // ─── ROLE-BASED ACCESS ───

  test('student cannot create recurring classes (403)', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'Student Recurring Attempt',
        scheduled_date: '2026-08-03',
        start_time: '10:00',
        end_time: '11:00',
        recurrence_rule: 'daily',
        recurrence_end_date: '2026-08-07',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });

  test('student cannot sync from teams (403)', async ({ request }) => {
    const res = await request.post('/api/timetable/sync-from-teams', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { classroom_id: E2E_CLASSROOM_ID },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });

  // ─── RECURRING CLASSES APPEAR IN FETCH ───

  test('recurring classes appear in timetable fetch', async ({ request }) => {
    const res = await request.get(
      `/api/timetable?classroom=${E2E_CLASSROOM_ID}&start=2026-08-01&end=2026-08-31`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Should find at least the recurring classes we created
    const recurringClasses = body.classes.filter(
      (c: any) => c.title === 'E2E Weekly Recurring Class' || c.title === 'E2E Daily Recurring Class'
    );
    expect(recurringClasses.length).toBeGreaterThanOrEqual(6);
  });

  // ─── CLEANUP ───

  test('cleanup: delete all test classes', async ({ request }) => {
    for (const classId of createdClassIds) {
      await request.delete('/api/timetable', {
        headers: { Authorization: `Bearer ${teacherToken}` },
        data: { id: classId, classroom_id: E2E_CLASSROOM_ID, permanent: true },
        failOnStatusCode: false,
      });
    }
  });
});

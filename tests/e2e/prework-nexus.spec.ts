import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Pre-class work E2E (API level).
 *
 * API level rather than browser level because the Entra tenant forces MFA and
 * the test accounts cannot complete an interactive sign-in. That is a real gap,
 * recorded here rather than papered over: the no-horizontal-overflow sweep on
 * the student timetable is the one check in this feature with no substitute,
 * and it stays unverified until the auth bootstrap is fixed.
 *
 * What CAN be proven without a browser is the part that matters most: the access
 * rules and the refusals, which have to hold whatever a client sends.
 *
 * The single most important assertion in this file is the last one. Pre-class
 * work must never gate a class. If a future change starts stripping the join URL
 * for a student who has not done their homework, that test fails.
 *
 * Self-skips without the Nexus dev server on :3012 or before the migration.
 */

const NEXUS = APP_URLS.nexus;
const MISSING = '00000000-0000-0000-0000-000000000000';

test.describe('Nexus, pre-class work', () => {
  test('the reason route requires auth', async ({ request }) => {
    const res = await request.post(`${NEXUS}/api/timetable/prework-reason`, {
      data: { assignment_id: MISSING, reason_code: 'no_time' },
    });
    expect(res.status()).not.toBe(200);
    expect([400, 401, 403, 500]).toContain(res.status());
  });

  test('an unknown assignment is refused rather than crashing', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.post(`${NEXUS}/api/timetable/prework-reason`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
      data: { assignment_id: MISSING, reason_code: 'no_time' },
    });
    expect(res.status()).not.toBe(200);
    expect([400, 403, 404]).toContain(res.status());
  });

  test('a reason code outside the set is rejected', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.post(`${NEXUS}/api/timetable/prework-reason`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
      data: { assignment_id: MISSING, reason_code: 'family' },
    });
    // 'family' belongs to the RSVP vocabulary, not this one.
    expect(res.status()).not.toBe(200);
  });

  test('a student cannot link assignments to a class', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };
    const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, { headers });
    if (sched.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const classes = (await sched.json()).classes || [];
    if (!classes.length) {
      test.skip(true, 'No classes visible to this student in this environment');
      return;
    }
    const res = await request.post(`${NEXUS}/api/timetable/${classes[0].id}/assignments`, {
      headers,
      data: { assignment_id: MISSING, timing: 'prework' },
    });
    expect(res.status()).toBe(403);
  });

  test('a student cannot act on the escalation queue', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.post(`${NEXUS}/api/timetable/prework-escalations`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
      data: { escalation_id: MISSING, action: 'notify_parent' },
    });
    expect(res.status()).not.toBe(200);
    expect([400, 403, 404]).toContain(res.status());
  });

  test('the escalation queue requires a classroom', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/prework-escalations`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    expect(res.status()).toBe(400);
  });

  test('the sweep cron is not open to the public', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/cron/prework-sweep`);
    // 401 when CRON_SECRET is set. When it is unset the route is a no-op guard
    // by design, so a 200 with a stats body is also correct; what must never
    // happen is a crash.
    expect([200, 401]).toContain(res.status());
  });

  test('my-schedule carries a prework block, even when empty', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/my-schedule`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (res.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const body = await res.json();
    expect(Array.isArray(body.prework)).toBe(true);
    for (const p of body.prework) {
      expect(['not_yet', 'due_soon', 'overdue_unanswered', 'answered', 'done', 'stale']).toContain(p.state);
      expect(typeof p.assignment_id).toBe('string');
    }
  });

  test('pre-class work NEVER withholds the join link', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/my-schedule`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (res.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const body = await res.json();
    const blocked = (body.prework || []).filter(
      (p: any) => p.state === 'overdue_unanswered' || p.state === 'due_soon',
    );
    if (!blocked.length) {
      test.skip(true, 'No outstanding prework for this student right now');
      return;
    }
    // Every class with outstanding prework must still hand over its meeting.
    // This is the guard on the whole "loud prompt, open door" design.
    for (const p of blocked) {
      const cls = (body.classes || []).find((c: any) => c.id === p.class_id);
      expect(cls, 'the class carrying outstanding prework is still in the schedule').toBeTruthy();
      if (cls.teams_meeting_id) {
        expect(
          cls.teams_meeting_join_url || cls.teams_meeting_url,
          'a class with unfinished prework still gives the student its join link',
        ).toBeTruthy();
      }
    }
  });
});

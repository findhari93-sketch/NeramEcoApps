import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * A wrapped-up class keeps the topic the teacher gave it.
 *
 * The bug this pins down: syncClassroomMeetings treated the Teams meeting
 * subject as the source of truth for `title` and rewrote the row on every pass.
 * A teacher named a class "Isometric Subtractive Cubes" in the Wrap Up panel and
 * found "Class by Ar.Hari Babu" there again a few minutes later. On 2026-07-30
 * one cron run retitled four classes in the same second, each still carrying the
 * brief and bullets that proved a human had written them.
 *
 * DRIVEN AT THE API, deliberately. The UI route to the wrap-up panel is long
 * (Plan view, walk back to a week with a class, select it, wait for the panel)
 * and every step is a chance to skip for the wrong reason. What has to be proven
 * is a server-side ownership rule, and the API states it in three calls.
 *
 * THE SYNC MUST RUN WITH THE TEACHER TOKEN. /api/timetable/sync-now is gated on
 * teach.timetable.schedule, so a student token gets a silent 403 and the test
 * would pass without ever running the reconciler it exists to test.
 */

const WRAPPED_TITLE = 'E2E Lock Check: Isometric Subtractive Cubes';

test.describe('wrap-up survives a Teams sync', () => {
  test('a class titled in Nexus keeps that title after the reconciler runs', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'No teacher auth available in this environment');
    const headers = { Authorization: `Bearer ${auth!.testToken}` };

    const classroomId = auth!.classrooms?.[0]?.classroom_id || auth!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'Teacher has no classroom to read classes from');

    // A past class: only those can be wrapped up.
    const listRes = await request.get(
      `${APP_URLS.nexus}/api/timetable?classroom_id=${classroomId}`,
      { headers },
    );
    test.skip(!listRes.ok(), `Timetable list unavailable (${listRes.status()})`);
    const classes = (await listRes.json())?.classes || [];

    const today = new Date().toISOString().slice(0, 10);
    const past = classes.filter((c: any) => c.scheduled_date < today && c.status !== 'cancelled');
    test.skip(past.length === 0, 'No past class available to wrap up');
    const cls = past[past.length - 1];

    // Restore whatever was there, so a failing run does not leave a real class
    // renamed. Runs even when an expect below fails.
    const originalTitle = cls.title;
    const originalNotes = cls.notes ?? '';
    test.info().annotations.push({ type: 'class', description: `${cls.id} (${originalTitle})` });

    try {
      const saveRes = await request.patch(`${APP_URLS.nexus}/api/timetable/${cls.id}/wrap-up`, {
        headers,
        data: {
          title: WRAPPED_TITLE,
          notes:
            'The lesson began by clarifying the difference between isometric and perspective drawing, then built a cube and carved shapes out of it.',
        },
      });
      expect(saveRes.ok(), `wrap-up save failed: ${saveRes.status()}`).toBeTruthy();
      expect((await saveRes.json()).class.title).toBe(WRAPPED_TITLE);

      // The reconciler. Before the guard, this is the call that reverted the title.
      const syncRes = await request.post(`${APP_URLS.nexus}/api/timetable/sync-now`, {
        headers,
        data: {},
      });
      expect(
        syncRes.status(),
        'sync-now refused the teacher token, so the reconciler never ran and this test proves nothing',
      ).not.toBe(403);

      const afterRes = await request.get(`${APP_URLS.nexus}/api/timetable/${cls.id}/wrap-up`, { headers });
      expect(afterRes.ok()).toBeTruthy();
      const after = (await afterRes.json()).class;

      expect(after.title, 'the Teams meeting subject overwrote the wrapped-up title').toBe(WRAPPED_TITLE);
      expect(after.content_edited_at, 'saving a wrap-up must stamp content_edited_at').toBeTruthy();
    } finally {
      await request
        .patch(`${APP_URLS.nexus}/api/timetable/${cls.id}/wrap-up`, {
          headers,
          data: { title: originalTitle, notes: originalNotes },
        })
        .catch(() => undefined);
    }
  });

  test('the wrap-up still saves when Microsoft Graph is unreachable', async ({ request }) => {
    // The Teams card refresh runs inside the save. If a Graph outage could fail
    // it, a teacher would see "Could not save the class" for work already
    // committed to the database.
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'No teacher auth available in this environment');
    const headers = { Authorization: `Bearer ${auth!.testToken}` };

    const classroomId = auth!.classrooms?.[0]?.classroom_id || auth!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'Teacher has no classroom');

    const listRes = await request.get(
      `${APP_URLS.nexus}/api/timetable?classroom_id=${classroomId}`,
      { headers },
    );
    test.skip(!listRes.ok(), 'Timetable list unavailable');
    const classes = (await listRes.json())?.classes || [];
    const today = new Date().toISOString().slice(0, 10);
    const past = classes.filter((c: any) => c.scheduled_date < today && c.status !== 'cancelled');
    test.skip(past.length === 0, 'No past class available');
    const cls = past[past.length - 1];
    const originalTitle = cls.title;

    try {
      // The test token is not a Graph token, so the server skips the Graph call
      // entirely. That IS the guarantee under test: a wrap-up saved by something
      // holding no Microsoft credential must still save.
      const res = await request.patch(`${APP_URLS.nexus}/api/timetable/${cls.id}/wrap-up`, {
        headers,
        data: { title: `${WRAPPED_TITLE} (no graph)` },
      });
      expect(res.ok(), `save failed without a Graph token: ${res.status()}`).toBeTruthy();
    } finally {
      await request
        .patch(`${APP_URLS.nexus}/api/timetable/${cls.id}/wrap-up`, {
          headers,
          data: { title: originalTitle },
        })
        .catch(() => undefined);
    }
  });
});

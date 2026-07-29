import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Watching a class recording from inside Nexus.
 *
 * The behaviour under test is WHO can watch. Nexus used to link straight out to
 * SharePoint, which handed the decision to Microsoft: a channel meeting's
 * recording is readable by the team, but anything else lands in the organizer's
 * OneDrive and is shared only with the people on the meeting invite. So an
 * enrolled student who was not invited, and any second teacher who was not, were
 * simply refused. On top of that, the recording link itself was sometimes a Graph
 * API address that needs a bearer token, so it opened for nobody at all.
 *
 * /api/timetable/[classId]/recording-stream fixes both: Nexus enrollment decides
 * access, and the file is resolved with the app-only token into a short-lived
 * stream URL.
 *
 * Everything self-skips when the dev server or the test accounts are unavailable,
 * following the convention in class-prep-nexus.spec.ts.
 */

const NEXUS = APP_URLS.nexus;

test.describe.configure({ mode: 'serial' });

test.describe('Class recording playback', () => {
  let teacherToken: string | null = null;
  let studentToken: string | null = null;
  /** A past class that has a recording attached, if this environment has one. */
  let recordedClassId: string | null = null;
  /** Any class at all, so the auth assertions can run without a recording. */
  let anyClassId: string | null = null;

  test('setup: tokens and a class with a recording', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    if (!teacher) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    teacherToken = teacher.testToken;
    studentToken = student?.testToken ?? null;

    const res = await request.get(`${NEXUS}/api/timetable/my-schedule?start=2020-01-01&end=2030-01-01`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    if (res.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const classes = (await res.json()).classes || [];
    anyClassId = classes[0]?.id ?? null;
    recordedClassId = classes.find((c: any) => c.recording_url)?.id ?? null;
  });

  test('an unauthenticated caller is refused', async ({ request }) => {
    if (!anyClassId) {
      test.skip(true, 'setup found no class');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/${anyClassId}/recording-stream`);
    expect([401, 403]).toContain(res.status());
  });

  test('a parent token is refused', async ({ request }) => {
    if (!anyClassId) {
      test.skip(true, 'setup found no class');
      return;
    }
    // verifyMsToken fails closed for parent tokens unless a route opts in, and
    // this one deliberately does not.
    const res = await request.get(`${NEXUS}/api/timetable/${anyClassId}/recording-stream`, {
      headers: { Authorization: 'Bearer par_not_a_real_token' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('a class with no recording says so rather than failing obscurely', async ({ request }) => {
    if (!teacherToken) {
      test.skip(true, 'setup did not produce a teacher token');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/my-schedule?start=2020-01-01&end=2030-01-01`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const classes = (await res.json()).classes || [];
    const withoutRecording = classes.find((c: any) => !c.recording_url);
    if (!withoutRecording) {
      test.skip(true, 'Every class in this environment has a recording');
      return;
    }
    const stream = await request.get(
      `${NEXUS}/api/timetable/${withoutRecording.id}/recording-stream`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    expect(stream.status()).toBe(404);
    expect((await stream.json()).error).toMatch(/no recording/i);
  });

  test('a teacher gets a playable stream URL, not a Graph address', async ({ request }) => {
    if (!recordedClassId || !teacherToken) {
      test.skip(true, 'No class with a recording in this environment');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/${recordedClassId}/recording-stream`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    // 409 is the honest answer for a legacy row still holding a Graph URL.
    if (res.status() === 409) {
      expect((await res.json()).error).toMatch(/re-sync/i);
      return;
    }
    expect(res.status()).toBe(200);
    const { streamUrl } = await res.json();
    expect(streamUrl).toBeTruthy();
    // The whole point: never hand back an address that needs a bearer token.
    expect(streamUrl).not.toContain('graph.microsoft.com');
    expect(streamUrl).toMatch(/^https:\/\//);
  });

  test('an enrolled student gets the same recording the teacher does', async ({ request }) => {
    if (!recordedClassId || !studentToken) {
      test.skip(true, 'No class with a recording, or no student token');
      return;
    }
    // This is the regression that matters. The student is enrolled in Nexus but
    // need not be an invitee of the Teams meeting, which is exactly the case
    // Microsoft used to refuse.
    const res = await request.get(`${NEXUS}/api/timetable/${recordedClassId}/recording-stream`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (res.status() === 409) {
      test.skip(true, 'This class still holds a legacy Graph URL');
      return;
    }
    expect(res.status()).toBe(200);
    expect((await res.json()).streamUrl).toBeTruthy();
  });

  test('a recording link is never a Graph API address', async ({ request }) => {
    if (!teacherToken) {
      test.skip(true, 'setup did not produce a teacher token');
      return;
    }
    // Guards the write paths as a whole: whatever put a recording_url there,
    // it must be something a browser can open.
    const res = await request.get(`${NEXUS}/api/timetable/my-schedule?start=2020-01-01&end=2030-01-01`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const withRecordings = ((await res.json()).classes || []).filter((c: any) => c.recording_url);
    for (const cls of withRecordings) {
      expect(cls.recording_url, `class ${cls.id} (${cls.title})`).not.toContain('graph.microsoft.com');
    }
  });
});

test.describe('Class recording player, mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the timetable has no horizontal overflow at 375px', async ({ page, request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    if (!teacher) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const { injectAuthForPage } = await import('../utils/credentials');
    await injectAuthForPage(page, 'teacher');
    await page.goto(`${NEXUS}/teacher/recordings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, 'recordings page must not scroll sideways on a phone').toBe(false);
  });

  test('the Watch button meets the 44px touch target minimum', async ({ page, request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    if (!teacher) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const { injectAuthForPage } = await import('../utils/credentials');
    await injectAuthForPage(page, 'teacher');
    await page.goto(`${NEXUS}/teacher/recordings`, { waitUntil: 'domcontentloaded' });

    const watch = page.getByRole('button', { name: 'Watch' }).first();
    if (!(await watch.isVisible().catch(() => false))) {
      test.skip(true, 'No recording listed for this account');
      return;
    }
    const box = await watch.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});

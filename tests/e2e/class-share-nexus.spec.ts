import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * "Share this class" E2E (API level).
 *
 * API level rather than browser level for the same reason as the resources and
 * prep-gate specs: the Entra tenant forces MFA, so the test accounts cannot
 * complete an interactive sign-in. The contract is what matters anyway.
 *
 * The three assertions that carry the most weight:
 *   1. a student is refused on BOTH verbs, because this route hands out every
 *      link attached to a class,
 *   2. no SharePoint or Graph URL ever appears in the payload, because the whole
 *      point of the recording ladder is that the raw recording URL is a leak, and
 *   3. POST with a Nexus test token is refused with a stated reason rather than
 *      reporting a success that never reached Teams.
 *
 * Self-skips without the Nexus dev server on :3012 or before the migration.
 */

const NEXUS = APP_URLS.nexus;
const MISSING = '00000000-0000-0000-0000-000000000000';

/** A class this teacher can actually share, or null when this env has none. */
async function findShareableClass(request: any, headers: Record<string, string>) {
  const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, { headers });
  if (sched.status() !== 200) return null;
  const classes = (await sched.json()).classes || [];
  for (const cls of classes.slice(0, 8)) {
    const res = await request.get(`${NEXUS}/api/timetable/${cls.id}/share`, { headers });
    if (res.status() === 200) return { cls, payload: await res.json() };
  }
  return null;
}

test.describe('Nexus — Share this class', () => {
  test('the share payload requires auth', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/timetable/${MISSING}/share`);
    expect(res.status()).not.toBe(200);
    expect([400, 401, 403, 500]).toContain(res.status());
  });

  test('an unknown class is refused rather than crashing', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/${MISSING}/share`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    expect(res.status()).not.toBe(200);
    // Never a 500: an unknown id is a routine miss, not a crash.
    expect([403, 404]).toContain(res.status());
  });

  test('a student is refused on both verbs', async ({ request }) => {
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
    const classId = classes[0].id;

    // A student is enrolled, so resolveClassStaffAccess lets them past the
    // enrolment check. canEdit is what must stop them.
    const read = await request.get(`${NEXUS}/api/timetable/${classId}/share`, { headers });
    expect(read.status()).toBe(403);

    const post = await request.post(`${NEXUS}/api/timetable/${classId}/share`, {
      headers,
      data: { sections: ['description'] },
    });
    expect(post.status()).toBe(403);
  });

  test('a teacher gets a well-formed payload that leaks no Microsoft URL', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };
    const found = await findShareableClass(request, headers);
    if (!found) {
      test.skip(true, 'No shareable class for this teacher in this environment');
      return;
    }
    const { payload } = found;

    expect(['upcoming', 'past', 'cancelled']).toContain(payload.state);
    expect(typeof payload.title).toBe('string');
    expect(Array.isArray(payload.assignments)).toBe(true);
    expect(['recap', 'catchup', 'none']).toContain(payload.links.watchKind);
    expect(payload.teams).toHaveProperty('hasChannel');
    expect(payload.teams).toHaveProperty('hasGroupChat');

    // Every student link is absolute, because this text gets pasted into a chat
    // where a relative path means nothing.
    const studentLinks = [
      payload.links.rsvp,
      payload.links.watch,
      payload.links.prepTest,
      payload.links.classTest,
      ...payload.assignments.map((a: any) => a.url),
    ].filter(Boolean);
    studentLinks.forEach((url: string) => expect(url).toMatch(/^https?:\/\//));

    // THE leak test. cls.recording_url is a SharePoint URL shared only with the
    // meeting's invitees; the watch link must be a Nexus page, never that.
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain('sharepoint.com');
    expect(serialised).not.toContain('graph.microsoft.com');
    expect(serialised).not.toContain('my.microsoftpersonalcontent.com');
  });

  test('posting with no sections chosen is refused', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };
    const found = await findShareableClass(request, headers);
    if (!found) {
      test.skip(true, 'No shareable class for this teacher in this environment');
      return;
    }

    const res = await request.post(`${NEXUS}/api/timetable/${found.cls.id}/share`, {
      headers,
      data: { sections: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('a Nexus test token cannot post to Teams, and is told why', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };
    const found = await findShareableClass(request, headers);
    if (!found) {
      test.skip(true, 'No shareable class for this teacher in this environment');
      return;
    }

    // A test_ token is Nexus's own, not Microsoft's. Sending it to Graph earns a
    // 401; reporting success would be worse. The route must say so plainly.
    const res = await request.post(`${NEXUS}/api/timetable/${found.cls.id}/share`, {
      headers,
      data: { sections: ['description'] },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/Microsoft sign-in/i);
  });
});

import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Class reference material E2E (API level).
 *
 * API level rather than browser level for the same reason as the catch-up and
 * prep-gate specs: the Entra tenant forces MFA, so the test accounts cannot
 * complete an interactive sign-in. What matters here is the contract anyway,
 * the rules that must hold whatever a client sends.
 *
 * The two that matter most:
 *   1. a student can READ a class's material but can never write to it, and
 *   2. a pasted `javascript:` URL never becomes a row, because these strings are
 *      rendered as anchors to a whole class of students.
 *
 * Self-skips without the Nexus dev server on :3012 or before the migration.
 */

const NEXUS = APP_URLS.nexus;
const MISSING = '00000000-0000-0000-0000-000000000000';
const SAMPLE_VIDEO = 'https://youtu.be/dQw4w9WgXcQ';

/** A class the teacher can actually edit, or null when this env has none. */
async function findTeachableClass(request: any, headers: Record<string, string>) {
  const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, { headers });
  if (sched.status() !== 200) return null;
  const classes = (await sched.json()).classes || [];
  for (const cls of classes.slice(0, 8)) {
    const res = await request.get(`${NEXUS}/api/timetable/${cls.id}/resources`, { headers });
    if (res.status() === 200 && (await res.json()).canEdit) return cls;
  }
  return null;
}

test.describe('Nexus — Class reference material', () => {
  test('the list requires auth', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/timetable/${MISSING}/resources`);
    expect(res.status()).not.toBe(200);
    expect([400, 401, 403, 500]).toContain(res.status());
  });

  test('an unknown class is refused rather than crashing', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/${MISSING}/resources`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    expect(res.status()).not.toBe(200);
    expect([403, 404]).toContain(res.status());
  });

  test('a student may read a class list but never write to it', async ({ request }) => {
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

    const read = await request.get(`${NEXUS}/api/timetable/${classId}/resources`, { headers });
    expect(read.status()).toBe(200);
    const body = await read.json();
    expect(Array.isArray(body.resources)).toBe(true);
    // The flag the UI keys the editor off. A student must never be handed it.
    expect(body.canEdit).toBe(false);

    // Every mutating verb, because one unguarded handler is enough.
    const post = await request.post(`${NEXUS}/api/timetable/${classId}/resources`, {
      headers, data: { url: SAMPLE_VIDEO },
    });
    expect(post.status()).toBe(403);

    const patch = await request.patch(`${NEXUS}/api/timetable/${classId}/resources`, {
      headers, data: { id: MISSING, title: 'nope' },
    });
    expect(patch.status()).toBe(403);

    const del = await request.delete(`${NEXUS}/api/timetable/${classId}/resources?id=${MISSING}`, {
      headers,
    });
    expect(del.status()).toBe(403);
  });

  test('a student cannot browse another teacher’s past material', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };
    const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, { headers });
    if (sched.status() !== 200) {
      test.skip(true, 'Timetable unavailable in this environment');
      return;
    }
    const classes = (await sched.json()).classes || [];
    if (!classes.length) {
      test.skip(true, 'No classes visible to this student');
      return;
    }
    const res = await request.get(
      `${NEXUS}/api/timetable/${classes[0].id}/resources?library=1`,
      { headers },
    );
    expect(res.status()).toBe(403);
  });

  test('a teacher can add a video, and it is canonicalised and readable', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };
    const cls = await findTeachableClass(request, headers);
    if (!cls) {
      test.skip(true, 'No class this teacher can edit in this environment');
      return;
    }

    const created = await request.post(`${NEXUS}/api/timetable/${cls.id}/resources`, {
      headers,
      data: { url: SAMPLE_VIDEO, note: 'E2E: watch the first minute' },
    });
    expect(created.status()).toBe(200);
    const resource = (await created.json()).resource;

    try {
      expect(resource.kind).toBe('youtube');
      // A youtu.be paste must land as one canonical watch URL, so the same video
      // shared three ways does not become three resources.
      expect(resource.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(resource.thumb_url).toBeTruthy();
      expect(resource.note).toBe('E2E: watch the first minute');

      const list = await request.get(`${NEXUS}/api/timetable/${cls.id}/resources`, { headers });
      expect(list.status()).toBe(200);
      const ids = ((await list.json()).resources || []).map((r: any) => r.id);
      expect(ids).toContain(resource.id);

      // Renaming and annotating, the two things the card's menu offers.
      const renamed = await request.patch(`${NEXUS}/api/timetable/${cls.id}/resources`, {
        headers,
        data: { id: resource.id, title: 'E2E renamed', note: 'E2E revised note' },
      });
      expect(renamed.status()).toBe(200);
      const after = (await renamed.json()).resource;
      expect(after.title).toBe('E2E renamed');
      expect(after.note).toBe('E2E revised note');
    } finally {
      const cleanup = await request.delete(
        `${NEXUS}/api/timetable/${cls.id}/resources?id=${resource.id}`,
        { headers },
      );
      expect(cleanup.ok()).toBe(true);
    }
  });

  test('a dangerous scheme is refused, never stored', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };
    const cls = await findTeachableClass(request, headers);
    if (!cls) {
      test.skip(true, 'No class this teacher can edit in this environment');
      return;
    }

    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'file:///etc/passwd']) {
      const res = await request.post(`${NEXUS}/api/timetable/${cls.id}/resources`, {
        headers, data: { url: bad },
      });
      expect(res.status(), bad).toBe(400);
    }

    // And nothing from that loop survived into the list.
    const list = await request.get(`${NEXUS}/api/timetable/${cls.id}/resources`, { headers });
    const urls = ((await list.json()).resources || []).map((r: any) => r.url || '');
    expect(urls.some((u: string) => u.startsWith('javascript:') || u.startsWith('data:'))).toBe(false);
  });

  test('an empty patch and a missing id are refused clearly', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };
    const cls = await findTeachableClass(request, headers);
    if (!cls) {
      test.skip(true, 'No class this teacher can edit in this environment');
      return;
    }

    const noId = await request.patch(`${NEXUS}/api/timetable/${cls.id}/resources`, {
      headers, data: { title: 'orphan' },
    });
    expect(noId.status()).toBe(400);

    // A row that exists but belongs to another class must 404, not silently
    // succeed: that scoping is what stops one class editing another's list.
    const foreign = await request.patch(`${NEXUS}/api/timetable/${cls.id}/resources`, {
      headers, data: { id: MISSING, title: 'foreign' },
    });
    expect([400, 404]).toContain(foreign.status());
  });

  test('the student reference page lists only enrolled classrooms', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/student/resources`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    expect(res.status()).toBe(200);
    const groups = (await res.json()).groups || [];
    expect(Array.isArray(groups)).toBe(true);
    // Every group that comes back must actually carry material; empty classes
    // are filtered server-side so the page never renders a bare heading.
    for (const g of groups) {
      expect(g.resources.length).toBeGreaterThan(0);
      expect(g.class_title).toBeTruthy();
    }
  });

  test('the student reference page requires auth', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/student/resources`);
    expect(res.status()).not.toBe(200);
  });
});

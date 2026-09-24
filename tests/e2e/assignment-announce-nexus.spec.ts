import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Nexus assignment announcements E2E (API level).
 *
 * Publishing an assignment now tells students about it: a card in the Teams
 * assignment channel and group chat, a Teams activity ping, and both bells.
 * This spec covers the part CI can actually observe.
 *
 * What is asserted, and what deliberately is not:
 *
 *  - Graph is not reachable from CI, and the test-login token is `test_`
 *    prefixed, which canPostToGraph rejects on purpose. So no Teams post is
 *    attempted and none is asserted.
 *  - `teams_announced_at` IS asserted. It is stamped regardless of whether
 *    Teams accepted the card, which makes it the honest CI-visible signal that
 *    the announce path ran rather than throwing on the way in.
 *  - The announce is fired without awaiting, so the publish response returns
 *    before the stamp lands. Every read of it polls.
 *
 * Runs without a browser login (the teacher UI login is MFA-gated) and
 * self-skips when the Nexus dev server / test-login is unavailable.
 *
 * Prerequisites (otherwise self-skips): Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;
const API = `${NEXUS}/api/assignments`;

/** Stable, greppable titles. Never Date.now(): leftovers must be findable. */
const PUBLISH_TITLE = 'E2E announce, publish path';
const LINK_TITLE = 'E2E announce, link guard';

test.describe('Nexus — Assignment announcements', () => {
  test.describe.configure({ mode: 'serial' });

  let token = '';
  let classroomId = '';
  const created: string[] = [];

  const authed = (extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  });

  /** Poll a published assignment until the fire-and-forget announce stamps it. */
  async function waitForAnnounce(request: any, id: string, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    let last: any = null;
    while (Date.now() < deadline) {
      const res = await request.get(`${API}/${id}`, { headers: authed() });
      if (res.ok()) {
        last = (await res.json()).assignment;
        if (last?.teams_announced_at) return last;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return last;
  }

  /** A scheduled class id in this classroom, from whichever source has one. */
  async function findLinkableClass(request: any): Promise<string | null> {
    // The catch-up calendar lists every taught class in a range (at most 45
    // days per request), whether or not anybody missed it. It replaced the
    // overview's classStats in 2026-10. Walks back a month at a time.
    const now = new Date();
    for (let back = 0; back < 6; back++) {
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
      const ymd = (d: Date) => d.toISOString().slice(0, 10);
      const cal = await request.get(
        `${NEXUS}/api/catchup/calendar?classroomId=${encodeURIComponent(classroomId)}&from=${ymd(first)}&to=${ymd(last)}`,
        { headers: authed() },
      );
      if (!cal.ok()) break;
      const found = ((await cal.json()).classes || [])[0];
      if (found?.id) return found.id;
    }

    const recaps = await request.get(
      `${NEXUS}/api/class-recaps/candidates?classroomId=${encodeURIComponent(classroomId)}`,
      { headers: authed() },
    );
    if (recaps.ok()) {
      const first = ((await recaps.json()).candidates || [])[0];
      if (first?.scheduled_class_id) return first.scheduled_class_id;
    }
    return null;
  }

  test('setup: teacher token and a classroom', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    token = auth.testToken;
    classroomId = auth.classrooms?.[0]?.id || auth.classrooms?.[0]?.classroom_id || '';
    expect(token).toBeTruthy();
    if (!classroomId) test.skip(true, 'Teacher has no classroom to create an assignment in');
  });

  test('a newly created assignment is a draft and has announced nothing', async ({ request }) => {
    if (!token || !classroomId) return;
    const res = await request.post(API, {
      headers: authed(),
      data: {
        action: 'create',
        classroom_id: classroomId,
        assignment_type: 'document',
        title: PUBLISH_TITLE,
        instructions: 'Created by the announcement E2E. Safe to delete.',
      },
    });
    expect(res.status()).toBe(200);
    const { assignment } = await res.json();
    created.push(assignment.id);

    expect(assignment.status).toBe('draft');
    // The guard the whole "one single message" rule rests on: a draft is silent.
    expect(assignment.teams_announced_at).toBeFalsy();
  });

  test('publishing stamps the announce marker', async ({ request }) => {
    if (!token || created.length === 0) return;
    const id = created[0];

    const res = await request.post(`${API}/${id}`, {
      headers: authed(),
      data: { action: 'publish' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).assignment.status).toBe('published');

    const after = await waitForAnnounce(request, id);
    expect(after?.teams_announced_at).toBeTruthy();
  });

  test('publishing does not 500 when the classroom has no Teams wiring', async ({ request }) => {
    // The regression this guards: an unwired classroom used to be the case
    // nobody tried. announceAssignmentToTeams must return null quietly rather
    // than throwing into the publish handler.
    if (!token || created.length === 0) return;
    const res = await request.get(`${API}/${created[0]}`, { headers: authed() });
    expect(res.status()).toBe(200);
  });

  test('linking a DRAFT announces nothing, which is what keeps the timetable path to one message', async ({
    request,
  }) => {
    if (!token || !classroomId) return;

    const createRes = await request.post(API, {
      headers: authed(),
      data: {
        action: 'create',
        classroom_id: classroomId,
        assignment_type: 'document',
        title: LINK_TITLE,
        instructions: 'Created by the announcement E2E. Safe to delete.',
      },
    });
    expect(createRes.status()).toBe(200);
    const draft = (await createRes.json()).assignment;
    created.push(draft.id);

    // Find a class in this classroom to link against.
    //
    // Deliberately NOT /api/timetable: that route 500s on this tree (it swallows
    // its PostgrestError, so there is nothing in the log to go on) and a broken
    // unrelated endpoint must not decide whether this test covers anything.
    // Two sources are tried because each filters the table differently, and a
    // classroom that trips one usually satisfies the other:
    //   - catchup/calendar lists every taught class in a month
    //   - class-recaps/candidates lists only classes that have a recording
    const classId = await findLinkableClass(request);
    if (!classId) {
      test.skip(true, 'Classroom has no scheduled class to link against');
      return;
    }

    const linkRes = await request.post(`${NEXUS}/api/timetable/${classId}/assignments`, {
      headers: authed(),
      data: { assignment_id: draft.id, timing: 'homework' },
    });
    expect(linkRes.status()).toBe(200);

    // Give any (incorrect) announce a chance to land before asserting absence.
    await new Promise((r) => setTimeout(r, 3000));
    const check = await request.get(`${API}/${draft.id}`, { headers: authed() });
    const linked = (await check.json()).assignment;
    expect(linked.scheduled_class_id).toBe(classId);
    // The point of the test: still a draft, so still silent.
    expect(linked.teams_announced_at).toBeFalsy();
    expect(linked.teams_announced_class_id).toBeFalsy();
  });

  test('linking a PUBLISHED assignment announces it against that class', async ({ request }) => {
    if (!token || created.length === 0) return;
    const id = created[0]; // published in an earlier test, never linked

    const classId = await findLinkableClass(request);
    if (!classId) {
      test.skip(true, 'Classroom has no scheduled class to link against');
      return;
    }

    const before = await request.get(`${API}/${id}`, { headers: authed() });
    expect((await before.json()).assignment.teams_announced_class_id).toBeFalsy();

    const linkRes = await request.post(`${NEXUS}/api/timetable/${classId}/assignments`, {
      headers: authed(),
      data: { assignment_id: id, timing: 'homework' },
    });
    expect(linkRes.status()).toBe(200);

    // The announce is fired without awaiting, so poll for the marker.
    const deadline = Date.now() + 20_000;
    let announced: any = null;
    while (Date.now() < deadline) {
      const res = await request.get(`${API}/${id}`, { headers: authed() });
      if (res.ok()) {
        announced = (await res.json()).assignment;
        if (announced?.teams_announced_class_id) break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(announced?.teams_announced_class_id).toBe(classId);

    // Relinking the same pair must stay silent. Unlink, relink, and confirm the
    // marker is unchanged: this is what stops a teacher tidying up their
    // timetable from re-announcing the same work to every student.
    await request.delete(`${NEXUS}/api/timetable/${classId}/assignments`, {
      headers: authed(),
      data: { assignment_id: id },
    });
    const relink = await request.post(`${NEXUS}/api/timetable/${classId}/assignments`, {
      headers: authed(),
      data: { assignment_id: id, timing: 'homework' },
    });
    expect(relink.status()).toBe(200);

    await new Promise((r) => setTimeout(r, 3000));
    const after = await request.get(`${API}/${id}`, { headers: authed() });
    expect((await after.json()).assignment.teams_announced_class_id).toBe(classId);
  });

  test('publish requires auth', async ({ request }) => {
    if (created.length === 0) return;
    const res = await request.post(`${API}/${created[0]}`, {
      headers: { 'Content-Type': 'application/json' },
      data: { action: 'publish' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('cleanup: remove the assignments this spec created', async ({ request }) => {
    if (!token) return;
    for (const id of created) {
      await request.delete(`${API}/${id}`, { headers: authed() }).catch(() => undefined);
    }
  });
});

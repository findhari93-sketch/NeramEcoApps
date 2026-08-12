/**
 * The catch-up loop: who missed a class, why, and did they make it up.
 *
 * Everyone attends by default, so a no-show leaves no trace: no RSVP row
 * (they never opted out) and no attendance row (Teams records only who joined).
 * The absence is the gap between the roster and the join list.
 *
 * Proves:
 *  - The 9 PM cron drafts that list and messages NO students. That restraint is
 *    the design, not an oversight: a machine deciding to message thirty
 *    teenagers at 9 PM is how a nudge becomes spam.
 *  - The teacher's reconciliation view separates "told us first" from
 *    "never said anything", which is the only group needing a person.
 *  - Sending is a staff action, recorded, and not repeatable by accident.
 *  - A student cannot mark themselves caught up before doing the work; the gate
 *    is enforced server-side, not only by a disabled button.
 *  - An open absence follows the student on their timetable until it is closed.
 *  - The class panel is told which classes are owed, so it can offer the guided
 *    catch-up instead of the open player, and hand the open player back once the
 *    class is cleared. A student who watches ungated earns nothing for it and
 *    would have to watch the whole class again to clear the absence.
 *
 * Creates one past-dated class in the E2E classroom and deletes it in afterAll,
 * which cascades the absence rows away.
 *
 * Run: pnpm test:e2e tests/e2e/timetable-catchup-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { test, expect } from '@playwright/test';
import { getTestAuthToken, APP_URLS } from '../utils/credentials';

test.use({ storageState: { cookies: [], origins: [] } });

const NEXUS = APP_URLS.nexus;

/** Today in IST, matching what the cron considers "today". */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test.describe('Catch-up loop', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;
  let classId: string | null = null;
  let studentId: string | null = null;

  const authed = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  test('setup: a class that finished earlier today, which nobody joined', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');
    teacherToken = teacher!.testToken;
    studentToken = student!.testToken;
    studentId = student!.user?.id ?? null;

    const res = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=2020-01-01&end=2030-01-01`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const { classrooms } = await res.json();
    test.skip(!classrooms?.length, 'Test student is not in any classroom');
    classroomId = classrooms[0].id;

    // 00:01 to 00:02 today: unambiguously finished, whatever time the suite runs.
    const create = await request.post(`${NEXUS}/api/timetable`, {
      headers: authed(teacherToken),
      data: {
        classroom_id: classroomId,
        title: 'E2E Missed Class',
        scheduled_date: istToday(),
        start_time: '00:01',
        end_time: '00:02',
      },
    });
    expect(create.ok()).toBe(true);
    classId = (await create.json()).class.id;

    // The class has a recording, and no guided recap built from it.
    //
    // Not decoration. Without a recording the class is "no recording, cannot be
    // caught up", which is a different feature: AC5 cannot be refused for not
    // watching something that does not exist, and AC10's "watching is the last
    // step" was never true of the class this suite was seeding.
    //
    // Recording present, recap absent is also the exact shape that stranded a
    // student in production on 2026-08-06: watchable, declarable, and then
    // refused at the last step with a sentence that named no cause.
    const recorded = await request.patch(`${NEXUS}/api/timetable`, {
      headers: authed(teacherToken),
      data: {
        id: classId,
        classroom_id: classroomId,
        recording_url: 'https://example.invalid/e2e-missed-class.mp4',
      },
    });
    expect(recorded.ok()).toBe(true);
  });

  test('AC1: the cron drafts the no-show list and messages no students', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.get(`${NEXUS}/api/cron/class-followups`);
    expect(res.ok()).toBe(true);
    const body = await res.json();

    // The whole point of the cron: it drafts and stops.
    expect(body.studentsMessaged).toBe(0);
    expect(body.noShows).toBeGreaterThan(0);
    expect((body.perClass || []).some((c: any) => c.id === classId)).toBe(true);
  });

  test('AC2: the reconciliation view separates no reason from told us first', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.get(`${NEXUS}/api/timetable/${classId}/followup`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body.stats.rosterSize).toBeGreaterThan(0);
    // Nobody joined a class that ran for a minute at midnight.
    expect(body.stats.present).toBe(0);
    expect(body.stats.unexplained).toBeGreaterThan(0);
    expect(body.stats.awaitingFollowup).toBeGreaterThan(0);

    const me = (body.students || []).find((s: any) => s.id === studentId);
    expect(me, 'the test student must appear on the roster').toBeTruthy();
    expect(me.absence?.kind).toBe('no_show');
  });

  test('AC3: a student cannot send a follow-up', async ({ request }) => {
    test.skip(!classId || !studentId, 'No class');

    const res = await request.post(`${NEXUS}/api/timetable/${classId}/followup`, {
      headers: authed(studentToken),
      data: { student_ids: [studentId] },
    });
    expect(res.status()).toBe(403);
  });

  test('AC4: the student sees the absence on their own timetable', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=${istToday()}&end=${istToday()}`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const { openAbsences } = await res.json();
    expect((openAbsences || []).some((a: any) => a.class_id === classId)).toBe(true);
  });

  test('AC4b: the class panel is told this class is owed, not just the banner', async ({ request }) => {
    test.skip(!classId, 'No class');

    // A different map from openAbsences above, and the panel needs this one:
    // openAbsences is capped at 20, drops late joiners and keeps only open rows,
    // because it feeds the "you missed N classes" banner. The drawer has to know
    // the state of whichever class was tapped, which is how it decides between
    // offering the guided catch-up and the open player.
    const res = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=${istToday()}&end=${istToday()}`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const { absences } = await res.json();
    expect(absences?.[classId!], 'the panel must see an obligation row').toBeTruthy();
    expect(absences[classId!].caught_up_at).toBeNull();
    expect(absences[classId!].excused_at).toBeNull();
  });

  test('AC4c: with no recap built, the open player stays open to the absentee', async ({ request }) => {
    test.skip(!classId, 'No class');

    // The regression this guards is severe and silent. A student who owes a class
    // is normally sent to the guided recap, but this class has none, and the
    // catch-up screen's own fallback player streams through THIS route. Refusing
    // here on the strength of the absence alone would leave such a student with
    // no way to watch the class at all and no way to clear it.
    //
    // The refusal itself (owed AND a recap published) is proved in the unit tests
    // for mayWatchUngated. It is not reachable from here: publishing a recap is
    // not something any API in this suite's reach can do.
    const res = await request.get(`${NEXUS}/api/timetable/${classId}/recording-stream`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    // The seeded recording_url is deliberately unresolvable, so this cannot
    // assert 200. What matters is that it was not turned away as an obligation.
    expect(res.status()).not.toBe(409);
    expect((await res.json().catch(() => ({}))).catchup_url).toBeUndefined();
  });

  test('AC5: marking caught up is refused before the recording is watched', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.post(`${NEXUS}/api/timetable/${classId}/catch-up`, {
      headers: authed(studentToken),
      data: { action: 'mark_caught_up' },
    });
    // Server-side, not just a disabled button.
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/watch the recording/i);
  });

  test('AC6: "other" needs a note, the preset reasons do not', async ({ request }) => {
    test.skip(!classId, 'No class');

    const bare = await request.post(`${NEXUS}/api/timetable/${classId}/catch-up`, {
      headers: authed(studentToken),
      data: { action: 'give_reason', reason_code: 'other' },
    });
    expect(bare.status()).toBe(400);

    const ok = await request.post(`${NEXUS}/api/timetable/${classId}/catch-up`, {
      headers: authed(studentToken),
      data: { action: 'give_reason', reason_code: 'unwell' },
    });
    expect(ok.ok()).toBe(true);
  });

  test('AC7: the reason reaches the teacher, moving the student out of unexplained', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.get(`${NEXUS}/api/timetable/${classId}/followup`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const body = await res.json();
    const me = (body.students || []).find((s: any) => s.id === studentId);
    expect(me.absence?.reason_code).toBe('unwell');
  });

  test('AC8: sending the follow-up records it, so nobody is chased twice', async ({ request }) => {
    test.skip(!classId || !studentId, 'No class');

    const send = await request.post(`${NEXUS}/api/timetable/${classId}/followup`, {
      headers: authed(teacherToken),
      // Teams off: the test asserts the bookkeeping, not Microsoft's delivery.
      data: { student_ids: [studentId], teams: false },
    });
    expect(send.ok()).toBe(true);
    expect((await send.json()).sent).toBe(1);

    const after = await request.get(`${NEXUS}/api/timetable/${classId}/followup`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const me = ((await after.json()).students || []).find((s: any) => s.id === studentId);
    expect(me.absence?.followup_sent_at).toBeTruthy();
  });

  test('AC9: a follow-up to someone who was not absent is refused', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.post(`${NEXUS}/api/timetable/${classId}/followup`, {
      headers: authed(teacherToken),
      data: { student_ids: ['00000000-0000-0000-0000-000000000000'], teams: false },
    });
    expect(res.status()).toBe(409);
  });

  test('AC10: the full gate opens once the steps are done', async ({ request }) => {
    test.skip(!classId, 'No class');

    const watched = await request.post(`${NEXUS}/api/timetable/${classId}/catch-up`, {
      headers: authed(studentToken),
      data: { action: 'mark_watched' },
    });
    expect(watched.ok()).toBe(true);

    // No assignment was attached to this class, so watching is the last step.
    const done = await request.post(`${NEXUS}/api/timetable/${classId}/catch-up`, {
      headers: authed(studentToken),
      data: { action: 'mark_caught_up' },
    });
    expect(done.ok()).toBe(true);

    // Closed absences stop following the student around.
    const schedule = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=${istToday()}&end=${istToday()}`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const { openAbsences, absences } = await schedule.json();
    expect((openAbsences || []).some((a: any) => a.class_id === classId)).toBe(false);

    // The row survives with its stamp set, and that stamp is what earns the
    // ungated recording back: the panel reads it to put "Watch Recording" where
    // "Do catch-up" used to be. A cleared class must not vanish from this map,
    // or the panel could not tell "finished it" from "was never absent".
    expect(absences?.[classId!]?.caught_up_at).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    if (!teacherToken || !classId) return;
    // Deleting the class cascades the absence rows away.
    await request
      .delete(`${NEXUS}/api/timetable`, {
        headers: authed(teacherToken),
        data: { id: classId, classroom_id: classroomId, permanent: true },
      })
      .catch(() => {});
  });
});

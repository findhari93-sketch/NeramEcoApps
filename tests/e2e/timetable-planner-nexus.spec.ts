/**
 * Timetable phase 3: draft weeks, the class-to-assignment link, and the importer.
 *
 * Proves the parts that are invisible until they go wrong:
 *  - A draft class is visible to staff and NOT to students. This is the whole
 *    point of drafting, and a filter regression would silently leak a
 *    half-planned week.
 *  - Publishing flips the week and reports what it did.
 *  - An assignment created from a class carries scheduled_class_id, and an
 *    existing one can be linked and unlinked without being deleted.
 *  - The importer writes drafts (never published), re-validates server-side,
 *    and does not duplicate a class that already occupies the slot.
 *
 * Creates real rows in the E2E classroom and deletes them in afterAll.
 *
 * Run: pnpm test:e2e tests/e2e/timetable-planner-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { test, expect } from '@playwright/test';
import { getTestAuthToken, APP_URLS } from '../utils/credentials';

test.use({ storageState: { cookies: [], origins: [] } });

const NEXUS = APP_URLS.nexus;

/** A date far enough out that it cannot collide with real scheduled classes. */
function futureDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 240 + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.describe('Timetable planner', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;
  let draftClassId: string | null = null;
  let importedIds: string[] = [];
  let assignmentId: string | null = null;

  const DRAFT_DATE = futureDate(0);
  const IMPORT_DATE = futureDate(1);

  test('setup: resolve the teacher classroom', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');
    teacherToken = teacher!.testToken;
    studentToken = student!.testToken;

    // Use a classroom the STUDENT is in, so the visibility assertions are real.
    const res = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=2020-01-01&end=2030-01-01`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const { classrooms } = await res.json();
    test.skip(!classrooms?.length, 'Test student is not in any classroom with classes');
    classroomId = classrooms[0].id;
  });

  test('AC1: a draft class is invisible to students and visible to staff', async ({ request }) => {
    test.skip(!classroomId, 'No classroom');

    const create = await request.post(`${NEXUS}/api/timetable`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {
        classroom_id: classroomId,
        title: 'E2E Draft Class',
        scheduled_date: DRAFT_DATE,
        start_time: '19:00',
        end_time: '20:00',
        publish_state: 'draft',
      },
    });
    expect(create.ok()).toBe(true);
    const created = (await create.json()).class;
    draftClassId = created.id;
    expect(created.publish_state).toBe('draft');
    // A draft has never been shown to anyone, so it has no publish time.
    expect(created.published_at).toBeNull();

    const staffView = await request.get(
      `${NEXUS}/api/timetable?classroom=${classroomId}&start=${DRAFT_DATE}&end=${DRAFT_DATE}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    const staffIds = ((await staffView.json()).classes || []).map((c: any) => c.id);
    expect(staffIds).toContain(draftClassId);

    const studentView = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=${DRAFT_DATE}&end=${DRAFT_DATE}`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const studentIds = ((await studentView.json()).classes || []).map((c: any) => c.id);
    expect(studentIds, 'a draft must never reach a student').not.toContain(draftClassId);
  });

  test('AC2: an assignment created from a class carries the link', async ({ request }) => {
    test.skip(!draftClassId, 'No draft class');

    const res = await request.post(`${NEXUS}/api/assignments`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {
        action: 'create',
        classroom_id: classroomId,
        assignment_type: 'document',
        title: 'E2E Linked Assignment',
        scheduled_class_id: draftClassId,
        class_date: DRAFT_DATE,
      },
    });
    expect(res.ok()).toBe(true);
    const assignment = (await res.json()).assignment;
    assignmentId = assignment.id;
    expect(assignment.scheduled_class_id).toBe(draftClassId);

    const listed = await request.get(`${NEXUS}/api/timetable/${draftClassId}/assignments`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const body = await listed.json();
    expect(body.assignments.map((a: any) => a.id)).toContain(assignmentId);
  });

  test('AC3: unlinking detaches without deleting, and relinking works', async ({ request }) => {
    test.skip(!assignmentId, 'No assignment');

    const unlink = await request.delete(`${NEXUS}/api/timetable/${draftClassId}/assignments`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: { assignment_id: assignmentId },
    });
    expect(unlink.ok()).toBe(true);

    const afterUnlink = await request.get(`${NEXUS}/api/timetable/${draftClassId}/assignments`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const body = await afterUnlink.json();
    expect(body.assignments).toHaveLength(0);
    // The assignment still exists, now offered as linkable. Unlinking must never
    // destroy work that may already have submissions against it.
    expect(body.linkable.map((a: any) => a.id)).toContain(assignmentId);

    const relink = await request.post(`${NEXUS}/api/timetable/${draftClassId}/assignments`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: { assignment_id: assignmentId },
    });
    expect(relink.ok()).toBe(true);
    expect((await relink.json()).assignment.scheduled_class_id).toBe(draftClassId);
  });

  test('AC4: publishing the week makes the draft visible to students', async ({ request }) => {
    test.skip(!draftClassId, 'No draft class');

    const preview = await request.get(
      `${NEXUS}/api/timetable/publish-week?classroom_id=${classroomId}&week_start=${DRAFT_DATE}&week_end=${DRAFT_DATE}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    expect((await preview.json()).count).toBeGreaterThan(0);

    const res = await request.post(`${NEXUS}/api/timetable/publish-week`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: { classroom_id: classroomId, week_start: DRAFT_DATE, week_end: DRAFT_DATE },
    });
    expect(res.ok()).toBe(true);
    expect((await res.json()).published).toBeGreaterThan(0);

    const studentView = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=${DRAFT_DATE}&end=${DRAFT_DATE}`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const studentIds = ((await studentView.json()).classes || []).map((c: any) => c.id);
    expect(studentIds).toContain(draftClassId);
  });

  test('AC5: publishing an already-live week is a no-op, not an error', async ({ request }) => {
    test.skip(!draftClassId, 'No draft class');

    const res = await request.post(`${NEXUS}/api/timetable/publish-week`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: { classroom_id: classroomId, week_start: DRAFT_DATE, week_end: DRAFT_DATE },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.published).toBe(0);
    expect(body.message).toMatch(/already live/i);
  });

  test('AC6: the importer writes drafts and re-validates server-side', async ({ request }) => {
    test.skip(!classroomId, 'No classroom');

    const res = await request.post(`${NEXUS}/api/timetable/import-week`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {
        classroom_id: classroomId,
        entries: [
          { kind: 'class', date: IMPORT_DATE, title: 'E2E Imported A', startTime: '19:00', endTime: '20:00' },
          // Each of these must be rejected by the server, not trusted from the client.
          { kind: 'class', date: 'not-a-date', title: 'Bad date', startTime: '19:00', endTime: '20:00' },
          { kind: 'class', date: IMPORT_DATE, title: 'Bad time', startTime: '99:99', endTime: '20:00' },
          { kind: 'class', date: IMPORT_DATE, title: 'Backwards', startTime: '20:00', endTime: '19:00' },
          { kind: 'class', date: IMPORT_DATE, title: '', startTime: '19:00', endTime: '20:00' },
        ],
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body.imported).toBe(1);
    expect(body.rejected).toHaveLength(4);

    // Imported classes are drafts: an upload must not push a week to students.
    const staffView = await request.get(
      `${NEXUS}/api/timetable?classroom=${classroomId}&start=${IMPORT_DATE}&end=${IMPORT_DATE}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    const imported = ((await staffView.json()).classes || []).filter((c: any) =>
      c.title.startsWith('E2E Imported'),
    );
    expect(imported).toHaveLength(1);
    expect(imported[0].publish_state).toBe('draft');
    importedIds = imported.map((c: any) => c.id);

    const studentView = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=${IMPORT_DATE}&end=${IMPORT_DATE}`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const studentTitles = ((await studentView.json()).classes || []).map((c: any) => c.title);
    expect(studentTitles).not.toContain('E2E Imported A');
  });

  test('AC7: re-importing the same file does not duplicate the slot', async ({ request }) => {
    test.skip(importedIds.length === 0, 'Nothing imported');

    const res = await request.post(`${NEXUS}/api/timetable/import-week`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {
        classroom_id: classroomId,
        entries: [
          { kind: 'class', date: IMPORT_DATE, title: 'E2E Imported A', startTime: '19:00', endTime: '20:00' },
        ],
      },
    });
    const body = await res.json();
    expect(body.imported).toBe(0);
    expect(body.skipped).toBe(1);
  });

  test('AC8: a student cannot publish a week', async ({ request }) => {
    test.skip(!classroomId, 'No classroom');

    const res = await request.post(`${NEXUS}/api/timetable/publish-week`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: { classroom_id: classroomId, week_start: DRAFT_DATE, week_end: DRAFT_DATE },
    });
    expect(res.status()).toBe(403);
  });

  test('AC9: a student cannot import a week', async ({ request }) => {
    test.skip(!classroomId, 'No classroom');

    const res = await request.post(`${NEXUS}/api/timetable/import-week`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: {
        classroom_id: classroomId,
        entries: [{ kind: 'class', date: IMPORT_DATE, title: 'Nope', startTime: '19:00', endTime: '20:00' }],
      },
    });
    expect(res.status()).toBe(403);
  });

  test.afterAll(async ({ request }) => {
    if (!teacherToken || !classroomId) return;
    const ids = [draftClassId, ...importedIds].filter(Boolean) as string[];
    for (const id of ids) {
      await request
        .delete(`${NEXUS}/api/timetable`, {
          headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
          data: { id, classroom_id: classroomId, permanent: true },
        })
        .catch(() => {});
    }
  });
});

import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Nexus class-assignments E2E (API level).
 *
 * Exercises the assignment routes end to end where an active teaching plan
 * exists for the teacher's classroom: create an assignment on a class day,
 * publish it, load the review matrix, then delete it. Falls back to guard-only
 * checks (auth + not-found + format lock) when no plan/tables are available, so
 * the suite is safe to run before the migration is applied.
 *
 * Prerequisites (otherwise self-skips): Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

test.describe('Nexus — Class assignments', () => {
  test.describe.configure({ mode: 'serial' });

  let token = '';
  let classroomId: string | null = null;

  test('setup: teacher token', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    token = auth.testToken;
    classroomId = auth.classrooms?.[0]?.id ?? null;
    expect(token).toBeTruthy();
  });

  test('assignment GET requires auth', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/assignments/00000000-0000-0000-0000-000000000000`);
    // No Authorization header -> 401 (never a 200 or a 500).
    expect([401, 403]).toContain(res.status());
  });

  test('a non-existent assignment is 404 for staff', async ({ request }) => {
    if (!token) return;
    const res = await request.get(`${NEXUS}/api/assignments/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // 404 when tables exist; 500 only if the migration is not applied yet.
    if (res.status() === 500) {
      test.skip(true, 'nexus_class_assignments not migrated in this environment');
      return;
    }
    expect(res.status()).toBe(404);
  });

  test('student upload-url request rejects an unknown assignment', async ({ request }) => {
    if (!token) return;
    const res = await request.post(`${NEXUS}/api/student/assignments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        action: 'create_upload_urls',
        assignment_id: '00000000-0000-0000-0000-000000000000',
        files: [{ name: 'a.pdf', mime: 'application/pdf', size_bytes: 1000 }],
      },
    });
    if (res.status() === 500) {
      test.skip(true, 'nexus_class_assignments not migrated in this environment');
      return;
    }
    // Assignment not found (404) or not published (403).
    expect([403, 404]).toContain(res.status());
  });

  test('full flow: create -> publish -> review matrix -> delete (needs an active plan)', async ({ request }) => {
    if (!token || !classroomId) {
      test.skip(true, 'No classroom for the teacher');
      return;
    }
    // Find an active/draft plan for this classroom.
    const plansRes = await request.get(`${NEXUS}/api/teaching-plans?classroom_id=${classroomId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!plansRes.ok()) {
      test.skip(true, 'teaching-plans route unavailable');
      return;
    }
    const plans = (await plansRes.json()).plans || [];
    const plan = plans.find((p: { status: string }) => p.status === 'active' || p.status === 'draft');
    if (!plan) {
      test.skip(true, 'No active/draft plan to attach an assignment to');
      return;
    }

    // The plan's first class day is its start_date.
    const date = plan.start_date;
    const createRes = await request.post(`${NEXUS}/api/teaching-plans/${plan.id}/class-day`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        action: 'create_assignment',
        date,
        title: 'e2e-assignment 25 math questions',
        submission_format: 'pdf_or_image',
        max_marks: 25,
      },
    });
    if (createRes.status() === 500) {
      test.skip(true, 'nexus_class_assignments not migrated in this environment');
      return;
    }
    if (createRes.status() === 400) {
      // No class scheduled on start_date in this plan's flow; not an error we own.
      test.skip(true, 'Plan has no class day on its start_date');
      return;
    }
    expect(createRes.status()).toBe(200);
    const assignmentId = (await createRes.json()).assignment.id;

    try {
      // Publish it.
      const pubRes = await request.post(`${NEXUS}/api/assignments/${assignmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { action: 'publish' },
      });
      expect(pubRes.status()).toBe(200);
      expect((await pubRes.json()).assignment.status).toBe('published');

      // Load the review matrix.
      const matrixRes = await request.get(`${NEXUS}/api/assignments/${assignmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(matrixRes.status()).toBe(200);
      const matrix = await matrixRes.json();
      expect(matrix.role).toBe('staff');
      expect(Array.isArray(matrix.roster)).toBe(true);
      expect(matrix.counts).toHaveProperty('total');

      // Marks must stay within the max.
      const badMark = await request.post(`${NEXUS}/api/assignments/${assignmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { action: 'review_submission', submission_id: '00000000-0000-0000-0000-000000000000', marks: 999 },
      });
      expect(badMark.status()).toBe(400);
    } finally {
      // Clean up (draft/zero-submission delete is allowed; published + no submissions is fine).
      await request.delete(`${NEXUS}/api/assignments/${assignmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});

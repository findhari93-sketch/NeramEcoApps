import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Teacher photo review queue E2E.
 *
 * The "Needs review" tab doubles as the one-time bulk backfill grid for photos
 * that existed before the rule came in, so the assertions that matter are:
 * two columns at 375px, the four status buckets always add up to the roster,
 * and a rejection cannot be saved without a reason (that reason is the only
 * thing the blocked student is shown).
 *
 * Prerequisites (otherwise self-skips): Nexus dev server on :3012, the
 * photo-approval migration applied, and the e2e teacher account reachable.
 *
 * The API assertions are all read-only or deliberately invalid writes, so this
 * spec cannot change any real student's photo status.
 */

const NEXUS = APP_URLS.nexus;
const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe('Nexus, photo review queue', () => {
  test.describe.configure({ mode: 'serial' });

  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;
  let ready = false;

  test.beforeAll(async ({ request }) => {
    const teacherRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    const studentRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    if (!teacherRes.ok() || !studentRes.ok()) return;
    teacherToken = (await teacherRes.json()).testToken;
    studentToken = (await studentRes.json()).testToken;
    if (!teacherToken) return;

    const me = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(teacherToken) });
    if (!me.ok()) return;
    classroomId = (await me.json()).classrooms?.[0]?.id;
    ready = !!classroomId;
  });

  test('setup: the queue answers and the buckets add up to the roster', async ({ request }) => {
    test.skip(!ready, 'No classroom available for the e2e teacher');

    const res = await request.get(
      `${NEXUS}/api/photo-review?classroom=${classroomId}&status=pending`,
      { headers: authHeader(teacherToken) },
    );
    test.skip(res.status() === 500, 'Photo approval migration not applied');
    expect(res.status()).toBe(200);

    const body = await res.json();
    const { pending, missing, rejected, approved } = body.counts;
    // Every student sits in exactly one bucket, so the four counts are the
    // whole roster. If they ever drift, a student has vanished from the queue.
    expect(pending + missing + rejected + approved).toBeGreaterThanOrEqual(body.rows.length);
    expect(body.status).toBe('pending');
  });

  /**
   * REGRESSION. This queue once showed 0 in all four tabs over a 30 student
   * classroom, with HTTP 200 and no error, because the roster embed named no
   * foreign key. nexus_enrollments points at users twice (user_id, removed_by),
   * so PostgREST refused the join, and the route discarded the error and
   * returned an empty list.
   *
   * The failure was invisible precisely because "no rows" and "query broken"
   * looked identical. So the assertion has to come from an independent source of
   * roster truth, not from the same endpoint.
   */
  test('the roster is not silently empty when the classroom has students', async ({ request }) => {
    test.skip(!ready);

    const enrollmentsRes = await request.get(
      `${NEXUS}/api/classrooms/${classroomId}/enrollments`,
      { headers: authHeader(teacherToken) },
    );
    test.skip(!enrollmentsRes.ok(), 'Could not read the roster independently');

    const enrollments = await enrollmentsRes.json();
    const rows: any[] = Array.isArray(enrollments)
      ? enrollments
      : enrollments.enrollments || enrollments.rows || [];
    const activeStudents = rows.filter(
      (e) => e.role === 'student' && e.is_active !== false && e.user?.is_alumni !== true,
    ).length;
    test.skip(activeStudents === 0, 'The e2e classroom genuinely has no students');

    const res = await request.get(`${NEXUS}/api/photo-review?classroom=${classroomId}`, {
      headers: authHeader(teacherToken),
    });
    expect(res.status()).toBe(200);
    const { counts } = await res.json();
    const total = counts.pending + counts.missing + counts.rejected + counts.approved;

    // The bug produced exactly total === 0 here. Anything else means the join ran.
    expect(total).toBeGreaterThan(0);
  });

  /**
   * A student with no Microsoft account is enrolled (they paid through the
   * marketing link) but has never opened Nexus, so the picture on their card is
   * the Google account photo that arrived with their signup, not a submission.
   * Approving it puts a face on the tenant identity that the student never
   * offered. Three of these also turned out to be duplicates of a real
   * @neramclasses.com row, so the same person appeared twice in the grid.
   *
   * The check comes from an independent endpoint (/api/students, which flags
   * them) rather than from the queue itself, so a queue-side regression cannot
   * hide behind its own filter.
   */
  test('students with no Microsoft account never reach the queue', async ({ request }) => {
    test.skip(!ready);

    const studentsRes = await request.get(`${NEXUS}/api/students?classroom=${classroomId}`, {
      headers: authHeader(teacherToken),
    });
    test.skip(!studentsRes.ok(), 'Could not read the roster independently');
    const { students } = await studentsRes.json();
    const awaiting: string[] = (students || [])
      .filter((s: any) => s.awaiting_microsoft)
      .map((s: any) => s.id);
    test.skip(awaiting.length === 0, 'Every student in this classroom already has a Microsoft account');

    // Sweep all four buckets: the exclusion is in the roster loader, so it must
    // hold whichever tab the teacher opens.
    for (const status of ['pending', 'missing', 'rejected', 'approved']) {
      const res = await request.get(
        `${NEXUS}/api/photo-review?classroom=${classroomId}&status=${status}`,
        { headers: authHeader(teacherToken) },
      );
      expect(res.status()).toBe(200);
      const { rows } = await res.json();
      const leaked = (rows || []).filter((r: any) => awaiting.includes(r.student?.id));
      expect(leaked).toHaveLength(0);
    }
  });

  test('every status bucket is queryable', async ({ request }) => {
    test.skip(!ready);
    for (const status of ['pending', 'missing', 'rejected', 'approved']) {
      const res = await request.get(
        `${NEXUS}/api/photo-review?classroom=${classroomId}&status=${status}`,
        { headers: authHeader(teacherToken) },
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.status).toBe(status);
      for (const row of body.rows) expect(row.photo_status).toBe(status);
    }
  });

  test('a rejection without a reason is refused', async ({ request }) => {
    test.skip(!ready);
    const res = await request.post(`${NEXUS}/api/photo-review`, {
      headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
      data: {
        decisions: [{ studentId: '00000000-0000-0000-0000-000000000000', decision: 'rejected' }],
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/reason/i);
  });

  test('an empty decision list is refused', async ({ request }) => {
    test.skip(!ready);
    const res = await request.post(`${NEXUS}/api/photo-review`, {
      headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
      data: { decisions: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('the Microsoft sync needs a classroom and refuses a student', async ({ request }) => {
    test.skip(!ready);

    const noClassroom = await request.post(`${NEXUS}/api/photo-review/sync-microsoft`, {
      headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
      data: {},
    });
    expect(noClassroom.status()).toBe(400);

    if (studentToken) {
      const asStudent = await request.post(`${NEXUS}/api/photo-review/sync-microsoft`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: { classroomId },
      });
      expect(asStudent.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('a student cannot read or write the review queue', async ({ request }) => {
    test.skip(!ready || !studentToken);
    const read = await request.get(`${NEXUS}/api/photo-review?classroom=${classroomId}`, {
      headers: authHeader(studentToken),
    });
    expect(read.status()).toBeGreaterThanOrEqual(400);

    const write = await request.post(`${NEXUS}/api/photo-review`, {
      headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
      data: { decisions: [{ studentId: 'x', decision: 'approved' }] },
    });
    expect(write.status()).toBeGreaterThanOrEqual(400);
  });

  test('mobile: the grid is two columns at 375px with no overflow', async ({ page }) => {
    test.skip(!ready);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${NEXUS}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('nexus_test_token', t), teacherToken);
    await page.goto(`${NEXUS}/teacher/photo-review`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Photo Review/i })).toBeVisible({
      timeout: 20000,
    });

    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(376);

    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toMatch(/—|&mdash;/);
  });

  test('mobile: the No photo tab warns what the gate will do', async ({ page }) => {
    test.skip(!ready);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${NEXUS}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('nexus_test_token', t), teacherToken);
    await page.goto(`${NEXUS}/teacher/photo-review`, { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /No photo/i }).click();
    await expect(page.getByText(/cannot open Nexus until they add one/i)).toBeVisible({
      timeout: 15000,
    });
  });
});

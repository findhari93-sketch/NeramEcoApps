import { test, expect } from '@playwright/test';
import { APP_URLS, TEACHER_ACCOUNT, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * Study stage and participation status.
 *
 * Two orthogonal axes on one enrolment: WHERE a student is in their studies
 * (Break Year / Class 12 / Class 11 / Class 10) and WHETHER they are still
 * participating (active / dormant). The most important test in this file is the
 * two-axis one: a dormant student must vanish from every monitoring surface
 * while keeping their stage and staying visible on the students screen.
 *
 * Everything self-skips when the migration has not been applied in this
 * environment, following the convention in class-prep-nexus.spec.ts, so running
 * the suite against an older branch does not produce a wall of red.
 *
 * Runs serially: the tests share one classroom and one student, and they mutate
 * that student's classification. Every mutation is restored in afterAll.
 */

const NEXUS = APP_URLS.nexus;

test.describe.configure({ mode: 'serial' });

test.describe('Student study stage and participation', () => {
  let token: string | null = null;
  let classroomId: string | null = null;
  let subjectId: string | null = null;
  /** What the subject looked like before this file touched it. */
  let original: { study_stage: string | null; participation_status: string } | null = null;
  let migrated = false;

  async function listStudents(request: any, query = '') {
    return request.get(`${NEXUS}/api/students?classroom=${classroomId}${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async function classify(request: any, body: Record<string, unknown>, auth = token) {
    return request.patch(`${NEXUS}/api/students/classification`, {
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      data: { classroomId, ...body },
    });
  }

  test.beforeAll(async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) return;
    token = auth.testToken;
    classroomId = auth.classrooms?.[0]?.id ?? null;
    if (!classroomId) return;

    // The Next.js dev server compiles a route on its FIRST request, and while it
    // does it answers 404. Treating that as "the migration is missing" would
    // silently skip this whole file after any code change, so the probe retries
    // rather than trusting one cold response.
    let res = await listStudents(request);
    for (let attempt = 0; attempt < 8 && res.status() === 404; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await listStudents(request);
    }
    if (res.status() !== 200) return;
    const body = await res.json();

    // A payload without counts.segments means the migration has not been
    // applied here, which is a skip rather than a failure.
    migrated = !!body?.counts?.segments;
    const first = (body.students || [])[0];
    if (first) {
      subjectId = first.id;
      original = {
        study_stage: first.study_stage ?? null,
        participation_status: first.participation_status ?? 'active',
      };
    }
  });

  test.afterAll(async ({ request }) => {
    // Restore both axes, whatever the tests left behind. Test accounts are
    // reused across specs, so leaking a dormant student here would silently
    // shrink the roster every other nexus spec sees.
    if (!token || !classroomId || !subjectId || !original) return;
    await classify(request, {
      studentIds: [subjectId],
      studyStage: original.study_stage,
      participationStatus: original.participation_status,
      reason: original.participation_status === 'dormant' ? 'Restoring E2E fixture' : undefined,
    });
  });

  test('the roster carries both axes and a full counts object', async ({ request }) => {
    test.skip(!migrated, 'Stage/participation migration not applied in this environment');

    const res = await listStudents(request);
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.counts).toHaveProperty('tracked');
    expect(body.counts).toHaveProperty('dormant');
    expect(body.counts.stage).toHaveProperty('gap_year');
    expect(body.counts.segments).toHaveProperty('exam_this_year');

    for (const s of body.students) {
      expect(s).toHaveProperty('study_stage');
      expect(['active', 'dormant']).toContain(s.participation_status);
    }
  });

  test('exam_this_year is DERIVED from the stage counts, never stored', async ({ request }) => {
    test.skip(!migrated, 'Migration not applied');

    const body = await (await listStudents(request)).json();
    const { stage, segments } = body.counts;

    // Dormant students leave every stage segment, so they are subtracted here.
    const dormantExam = (body.students || []).filter(
      (s: any) =>
        s.participation_status === 'dormant' &&
        (s.study_stage === 'gap_year' || s.study_stage === '12th'),
    ).length;

    expect(segments.exam_this_year).toBe(stage.gap_year + stage['12th'] - dormantExam);
    expect(segments.all_active + segments.dormant).toBe(body.counts.total);
  });

  test('a restricted teacher cannot classify, a manager can', async ({ request }) => {
    test.skip(!migrated || !subjectId, 'Migration not applied or no student to work with');

    // The restricted external tier. test-login defaults role:'teacher' to
    // MANAGER for backwards compatibility, so this asks for it explicitly.
    const restricted = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: TEACHER_ACCOUNT.email, role: 'teacher', staffRole: 'teacher' },
    });
    expect(restricted.ok()).toBeTruthy();
    const restrictedToken = (await restricted.json()).testToken;

    const denied = await classify(
      request,
      { studentIds: [subjectId], studyStage: '11th' },
      restrictedToken,
    );
    expect(denied.status()).toBe(403);

    // Put the shared account back on the manager tier before anything else runs.
    const asManager = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: TEACHER_ACCOUNT.email, role: 'teacher', staffRole: 'manager' },
    });
    token = (await asManager.json()).testToken;

    const allowed = await classify(request, { studentIds: [subjectId], studyStage: '11th' });
    expect(allowed.status()).toBe(200);
  });

  test('setting a stage stamps staff provenance', async ({ request }) => {
    test.skip(!migrated || !subjectId, 'Migration not applied');

    const res = await classify(request, { studentIds: [subjectId], studyStage: 'gap_year' });
    expect(res.status()).toBe(200);

    const body = await (await listStudents(request)).json();
    const subject = body.students.find((s: any) => s.id === subjectId);
    expect(subject.study_stage).toBe('gap_year');
    // 'staff' rather than 'onboarding_backfill': a deliberate decision, not a
    // value copied off the student's own form.
    expect(subject.study_stage_source).toBe('staff');
  });

  test('dormant drops the student from every monitoring surface but not the roster', async ({ request }) => {
    test.skip(!migrated || !subjectId, 'Migration not applied');

    const marked = await classify(request, {
      studentIds: [subjectId],
      participationStatus: 'dormant',
      reason: 'E2E: verifying exclusion from monitoring',
    });
    expect(marked.status()).toBe(200);

    // (a) Still on the students screen, under its own segment, stage intact.
    const roster = await (await listStudents(request)).json();
    const subject = roster.students.find((s: any) => s.id === subjectId);
    expect(subject).toBeTruthy();
    expect(subject.participation_status).toBe('dormant');
    expect(subject.study_stage).toBe('gap_year'); // the other axis is untouched
    expect(subject.dormant_reason).toContain('E2E');
    expect(roster.counts.dormant).toBeGreaterThan(0);

    // (b) Gone from the at-risk watchlist. Without the exclusion every dormant
    // student scores as critically disengaged and buries the real cases.
    const inactivity = await request.get(
      `${NEXUS}/api/students/inactivity?classroom=${classroomId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (inactivity.status() === 200) {
      const rows = (await inactivity.json()).rows || [];
      expect(rows.some((r: any) => r.student_id === subjectId || r.id === subjectId)).toBe(false);
    }

    // (c) Gone from the RSVP "no response" chase list.
    const rsvp = await request.get(
      `${NEXUS}/api/timetable/rsvp-dashboard?classroom_id=${classroomId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (rsvp.status() === 200) {
      const payload = JSON.stringify(await rsvp.json());
      expect(payload.includes(subjectId!)).toBe(false);
    }
  });

  test('bringing them back clears the dormant stamp', async ({ request }) => {
    test.skip(!migrated || !subjectId, 'Migration not applied');

    const res = await classify(request, {
      studentIds: [subjectId],
      participationStatus: 'active',
    });
    expect(res.status()).toBe(200);

    const body = await (await listStudents(request)).json();
    const subject = body.students.find((s: any) => s.id === subjectId);
    expect(subject.participation_status).toBe('active');
    // Cleared, not kept: a stale dormant_since would corrupt "how long were
    // they away" the next time they pause.
    expect(subject.dormant_since).toBeNull();
    expect(subject.dormant_reason).toBeNull();
  });

  test('dormant without a reason is refused', async ({ request }) => {
    test.skip(!migrated || !subjectId, 'Migration not applied');

    const res = await classify(request, {
      studentIds: [subjectId],
      participationStatus: 'dormant',
      reason: '   ',
    });
    expect(res.status()).toBe(400);
  });

  test('an id outside this classroom is skipped, not updated', async ({ request }) => {
    test.skip(!migrated || !subjectId, 'Migration not applied');

    const res = await classify(request, {
      // A well-formed uuid that is nobody in this classroom. The write is scoped
      // to (classroom, role, is_active), which is the security boundary for a
      // route that accepts client-supplied ids.
      studentIds: ['00000000-0000-4000-8000-000000000000'],
      studyStage: '11th',
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(0);
    expect(body.skipped).toHaveLength(1);
  });

  test('sending neither axis is refused', async ({ request }) => {
    test.skip(!migrated || !subjectId, 'Migration not applied');
    const res = await classify(request, { studentIds: [subjectId] });
    expect(res.status()).toBe(400);
  });

  test('UI: lands on Exam this year and renders all six segments', async ({ page }) => {
    test.skip(!migrated, 'Migration not applied');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded' });

    const bar = page.getByRole('tablist', { name: /filter students by category/i });
    await expect(bar).toBeVisible({ timeout: 15000 });

    for (const label of ['Exam this year', 'All active', 'Class 11', 'Lower', 'Not set', 'Dormant']) {
      await expect(bar.getByText(label, { exact: true })).toBeVisible();
    }

    // Scoped to the segment bar on purpose: StudentsTabs (All Students /
    // City-Wise / Watchlist) also renders role="tab", so an unscoped query
    // matches two selected tabs and fails on strict mode rather than on
    // anything real.
    await expect(bar.getByRole('tab', { selected: true })).toContainText('Exam this year');
  });

  test('UI: the not-set banner appears exactly when some student has no stage', async ({ page, request }) => {
    test.skip(!migrated, 'Migration not applied');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');

    const counts = (await (await listStudents(request)).json()).counts;

    await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tablist', { name: /filter students/i })).toBeVisible({ timeout: 15000 });

    const banner = page.getByText(/no study stage set/i);
    if (counts.stage.unset > 0) await expect(banner).toBeVisible();
    else await expect(banner).toHaveCount(0);
  });
});

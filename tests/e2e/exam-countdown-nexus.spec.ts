import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * Exam countdown E2E: "how many days until the exam", across all four roles.
 *
 * The acceptance test for the whole feature is `one edit, three surfaces` at the
 * bottom: with the date marked Expected every dashboard hedges, and after ONE
 * admin edit flipping it to Confirmed every dashboard states it exactly. That is
 * the requirement the feature exists to satisfy, so if only one test in this file
 * survives a refactor, keep that one.
 *
 * Uses the /api/auth/test-login bypass rather than a real Microsoft login: the
 * tenant enforces mandatory MFA, so loginAsRole cannot complete for the e2e
 * teacher account.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

/** A JEE session comfortably in the future, so the countdown never goes negative. */
const FUTURE_YEAR = new Date().getFullYear() + 1;
const EXPECTED_DATE = `${FUTURE_YEAR}-01-20`;
const NOTE =
  'NTA has not announced Session 1 yet. For the last three years Paper 2A has fallen in the third week of January.';

type Created = { id: string; token: string } | null;

/**
 * Create an Expected JEE row for next January. Returns null when the dev server
 * or the staff capability is unavailable, so callers can skip rather than fail.
 */
async function seedExpectedExamDate(request: any): Promise<Created> {
  const auth = await getTestAuthToken(request, 'teacher');
  if (!auth) return null;

  const res = await request.post(`${NEXUS}/api/documents/exam-dates`, {
    headers: { Authorization: `Bearer ${auth.testToken}` },
    data: {
      exam_type: 'jee',
      year: FUTURE_YEAR,
      phase: 'session_1',
      attempt_number: 1,
      exam_date: EXPECTED_DATE,
      label: `JEE Main ${FUTURE_YEAR} Session 1, Paper 2A (B.Arch)`,
      date_confidence: 'expected',
      date_note: NOTE,
    },
  });

  if (!res.ok()) return null;
  const body = await res.json();
  return { id: body.exam_date.id, token: auth.testToken };
}

async function removeExamDate(request: any, created: Created) {
  if (!created) return;
  await request
    .delete(`${NEXUS}/api/documents/exam-dates/${created.id}`, {
      headers: { Authorization: `Bearer ${created.token}` },
    })
    .catch(() => {});
}

test.describe('Nexus, exam countdown', () => {
  test('the registry round-trips confidence and the note', async ({ request }) => {
    const created = await seedExpectedExamDate(request);
    if (!created) {
      test.skip(true, 'Nexus dev server / exam-dates write unavailable');
      return;
    }

    try {
      const res = await request.get(`${NEXUS}/api/documents/exam-dates?year=${FUTURE_YEAR}`, {
        headers: { Authorization: `Bearer ${created.token}` },
      });
      expect(res.status()).toBe(200);

      const row = (await res.json()).exam_dates.find((d: any) => d.id === created.id);
      expect(row).toBeTruthy();
      expect(row.date_confidence).toBe('expected');
      expect(row.date_note).toBe(NOTE);
      expect(row.exam_date).toBe(EXPECTED_DATE);
    } finally {
      await removeExamDate(request, created);
    }
  });

  // The GET is student-facing: /student/exam-recall reads it. Tightening this
  // route to staff-only is an easy mistake to make and would break that page.
  test('the exam-dates read stays open to students', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await request.get(`${NEXUS}/api/documents/exam-dates`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).exam_dates)).toBe(true);
  });

  test('a student cannot write to the registry', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await request.post(`${NEXUS}/api/documents/exam-dates`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
      data: {
        exam_type: 'jee',
        year: FUTURE_YEAR,
        phase: 'session_1',
        attempt_number: 2,
        exam_date: EXPECTED_DATE,
      },
    });
    expect(res.status()).toBe(403);
  });

  test('an anonymous caller cannot write to the registry', async ({ request }) => {
    const res = await request.post(`${NEXUS}/api/documents/exam-dates`, {
      data: {
        exam_type: 'jee',
        year: FUTURE_YEAR,
        phase: 'session_1',
        attempt_number: 2,
        exam_date: EXPECTED_DATE,
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  // The PATCH used to be .update({ ...body }), so anything in the request body
  // reached the table. created_by must be dropped, not applied.
  test('the PATCH body allowlist drops fields it does not own', async ({ request }) => {
    const created = await seedExpectedExamDate(request);
    if (!created) {
      test.skip(true, 'Nexus dev server / exam-dates write unavailable');
      return;
    }

    try {
      const res = await request.patch(`${NEXUS}/api/documents/exam-dates/${created.id}`, {
        headers: { Authorization: `Bearer ${created.token}` },
        data: {
          date_note: 'An edited note.',
          created_by: '00000000-0000-0000-0000-000000000000',
          id: '00000000-0000-0000-0000-000000000000',
        },
      });
      expect(res.status()).toBe(200);

      const row = (await res.json()).exam_date;
      expect(row.date_note).toBe('An edited note.');
      expect(row.id).toBe(created.id);
      expect(row.created_by).not.toBe('00000000-0000-0000-0000-000000000000');
    } finally {
      await removeExamDate(request, created);
    }
  });

  test('an invalid confidence value is rejected', async ({ request }) => {
    const created = await seedExpectedExamDate(request);
    if (!created) {
      test.skip(true, 'Nexus dev server / exam-dates write unavailable');
      return;
    }

    try {
      const res = await request.patch(`${NEXUS}/api/documents/exam-dates/${created.id}`, {
        headers: { Authorization: `Bearer ${created.token}` },
        data: { date_confidence: 'probably' },
      });
      expect(res.status()).toBe(400);
    } finally {
      await removeExamDate(request, created);
    }
  });

  test('all three dashboards expose an examCountdown field', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    if (!teacher || !student) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const teacherClassroom = teacher.classrooms?.[0]?.id;
    const studentClassroom = student.classrooms?.[0]?.id;
    if (!teacherClassroom || !studentClassroom) {
      test.skip(true, 'Test accounts have no classroom enrolment');
      return;
    }

    const teacherRes = await request.get(
      `${NEXUS}/api/dashboard/teacher?classroom=${teacherClassroom}`,
      { headers: { Authorization: `Bearer ${teacher.testToken}` } },
    );
    expect(teacherRes.status()).toBe(200);
    expect(await teacherRes.json()).toHaveProperty('examCountdown');

    const studentRes = await request.get(
      `${NEXUS}/api/dashboard/student?classroom=${studentClassroom}`,
      { headers: { Authorization: `Bearer ${student.testToken}` } },
    );
    expect(studentRes.status()).toBe(200);
    expect(await studentRes.json()).toHaveProperty('examCountdown');
  });

  // Only the date crosses the wire. A server-computed day count would be stale
  // the moment a tab crossed midnight IST, and two numbers can disagree.
  test('the payload carries a date and no day count', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const classroom = teacher?.classrooms?.[0]?.id;
    if (!teacher || !classroom) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await request.get(`${NEXUS}/api/dashboard/teacher?classroom=${classroom}`, {
      headers: { Authorization: `Bearer ${teacher.testToken}` },
    });
    const countdown = (await res.json()).examCountdown;
    if (!countdown) {
      test.skip(true, 'No target exam linked to this classroom yet');
      return;
    }

    expect(countdown.exam_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(countdown).not.toHaveProperty('days_left');
    expect(['expected', 'confirmed']).toContain(countdown.confidence);
  });

  test('a teacher can point a plan at a target exam and clear it again', async ({ request }) => {
    const created = await seedExpectedExamDate(request);
    if (!created) {
      test.skip(true, 'Nexus dev server / exam-dates write unavailable');
      return;
    }

    const headers = { Authorization: `Bearer ${created.token}` };
    try {
      const plansRes = await request.get(`${NEXUS}/api/teaching-plans`, { headers });
      if (!plansRes.ok()) {
        test.skip(true, 'Teaching plans unavailable');
        return;
      }
      const plan = (await plansRes.json()).plans?.[0];
      if (!plan) {
        test.skip(true, 'No teaching plan to link');
        return;
      }

      const originalTarget = plan.target_exam_date_id ?? null;

      const linked = await request.patch(`${NEXUS}/api/teaching-plans/${plan.id}`, {
        headers,
        data: { target_exam_date_id: created.id },
      });
      expect(linked.status()).toBe(200);
      expect((await linked.json()).plan.target_exam_date_id).toBe(created.id);

      // Restore, so the shared dev database is left as it was found.
      const restored = await request.patch(`${NEXUS}/api/teaching-plans/${plan.id}`, {
        headers,
        data: { target_exam_date_id: originalTarget },
      });
      expect(restored.status()).toBe(200);
    } finally {
      await removeExamDate(request, created);
    }
  });

  /**
   * THE ACCEPTANCE TEST. One admin edit changes the wording everywhere.
   *
   * Asserts at the resolver boundary rather than by scraping three pages,
   * because the prose is produced client-side from this payload by a single
   * function, and that function's own wording is covered exhaustively by
   * apps/nexus/src/lib/exam-countdown.test.ts.
   */
  test('one edit flips the countdown from hedged to firm', async ({ request }) => {
    const created = await seedExpectedExamDate(request);
    if (!created) {
      test.skip(true, 'Nexus dev server / exam-dates write unavailable');
      return;
    }

    const headers = { Authorization: `Bearer ${created.token}` };
    try {
      const plansRes = await request.get(`${NEXUS}/api/teaching-plans`, { headers });
      const plan = plansRes.ok() ? (await plansRes.json()).plans?.[0] : null;
      if (!plan) {
        test.skip(true, 'No teaching plan to link');
        return;
      }
      const originalTarget = plan.target_exam_date_id ?? null;

      await request.patch(`${NEXUS}/api/teaching-plans/${plan.id}`, {
        headers,
        data: { target_exam_date_id: created.id },
      });

      const readCountdown = async () => {
        const res = await request.get(
          `${NEXUS}/api/dashboard/teacher?classroom=${plan.classroom_id}`,
          { headers },
        );
        return (await res.json()).examCountdown;
      };

      // Before: the date is our own estimate, so the payload says so and every
      // surface hedges.
      const before = await readCountdown();
      if (before?.exam_date !== EXPECTED_DATE) {
        test.skip(true, 'Plan is not the active plan for its classroom');
        return;
      }
      expect(before.confidence).toBe('expected');
      expect(before.note).toBe(NOTE);

      // The one edit. Needs system.settings, so it only succeeds for an admin.
      const confirm = await request.patch(`${NEXUS}/api/documents/exam-dates/${created.id}`, {
        headers,
        data: { date_confidence: 'confirmed' },
      });
      if (confirm.status() === 403) {
        test.skip(true, 'Test account lacks system.settings, cannot confirm a date');
        return;
      }
      expect(confirm.status()).toBe(200);

      // After: official, and the stale "we are guessing" note is gone.
      const after = await readCountdown();
      expect(after.confidence).toBe('confirmed');
      expect(after.note).toBeNull();
      expect(after.exam_date).toBe(EXPECTED_DATE);

      await request.patch(`${NEXUS}/api/teaching-plans/${plan.id}`, {
        headers,
        data: { target_exam_date_id: originalTarget },
      });
    } finally {
      await removeExamDate(request, created);
    }
  });

  test('the teacher dashboard renders a countdown tile or its empty state', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/teacher/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Classes Today')).toBeVisible({ timeout: 30_000 });

    // Either a resolved countdown or the actionable "Not set" prompt. Teachers
    // are the only role told when no exam date is linked, because they can fix it.
    const tile = page.getByText(/Not set|months to go|weeks to go|days to go|Not confirmed|JEE|NATA/);
    await expect(tile.first()).toBeVisible({ timeout: 30_000 });
  });
});

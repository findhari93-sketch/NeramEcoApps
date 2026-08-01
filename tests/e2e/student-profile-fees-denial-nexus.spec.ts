import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * THE FEE GATE.
 *
 * A teacher must not see what a family owes. The rule this suite defends is that
 * the gate is enforced by ABSENCE, not by hiding: the routes a teacher can reach
 * never select the commercial columns, so the numbers are not in the payload to
 * be found in devtools. A CSS-level "hide the section" would pass a screenshot
 * test and fail this one.
 *
 * The strongest assertion here is the serialised-body check. It looks for the
 * column names anywhere at any depth rather than at a known path, so it keeps
 * working after a future reshape of the response.
 *
 * API level, following the precedent in catchup-missed-nexus.spec.ts: the Entra
 * tenant forces MFA so the test accounts cannot complete an interactive sign-in,
 * and the contract is what matters for a security rule anyway.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

/** Column names that must never reach a caller without coord.student.finance. */
const COMMERCIAL_COLUMNS = [
  'final_fee',
  'assigned_fee',
  'discount_amount',
  'full_payment_discount',
  'coupon_code',
  'payment_scheme',
  'payment_deadline',
  'installment_1_amount',
  'installment_2_amount',
  'allowed_payment_modes',
  'total_cashback_eligible',
  'fee_paid',
  'fee_due',
  'total_fee',
  'next_payment_date',
  'payment_status',
  'caste_category',
  'utm_source',
  'utm_campaign',
  'referral_code',
];

/**
 * A Next dev server answers /_not-found (404) while it compiles a route, so the
 * first request to a cold endpoint can 404 for reasons unrelated to the code.
 * A genuinely missing route 404s every attempt, so this hides nothing.
 */
async function getWarm(request: any, url: string, headers: Record<string, string> = {}) {
  let res = await request.get(url, { headers });
  for (let i = 0; i < 3 && res.status() === 404; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    res = await request.get(url, { headers });
  }
  return res;
}

async function context(request: any) {
  const auth = await getTestAuthToken(request, 'teacher');
  if (!auth) return null;
  const classroom = auth.classrooms?.[0];
  if (!classroom) return null;

  const res = await getWarm(request, `${NEXUS}/api/students?classroom=${classroom.id}`, {
    Authorization: `Bearer ${auth.testToken}`,
  });
  if (res.status() !== 200) return null;
  const body = await res.json();
  const student = body.students?.[0];
  if (!student) return null;

  return { auth, classroomId: classroom.id, studentId: student.id };
}

// A retried test login against a cold dev server runs past Playwright's 30s
// default, which would fail for reasons unrelated to the gate under test.
test.describe.configure({ timeout: 180_000 });

test.describe('Nexus student profile — the fee gate', () => {
  test('the core bundle never carries a commercial column, whatever the tier', async ({
    request,
  }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server / test-login / roster unavailable');
      return;
    }

    const res = await getWarm(
      request,
      `${NEXUS}/api/students/${ctx.studentId}?classroom=${ctx.classroomId}`,
      { Authorization: `Bearer ${ctx.auth.testToken}` },
    );
    expect(res.status()).toBe(200);

    // Serialised, so a reshape of the payload cannot smuggle a field past this.
    const serialised = JSON.stringify(await res.json());
    const leaked = COMMERCIAL_COLUMNS.filter((c) => serialised.includes(c));
    expect(leaked, `commercial columns leaked into the core bundle: ${leaked.join(', ')}`).toEqual(
      [],
    );
  });

  test('the finance route answers 403, not 401, when the capability is missing', async ({
    request,
  }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }

    const core = await getWarm(
      request,
      `${NEXUS}/api/students/${ctx.studentId}?classroom=${ctx.classroomId}`,
      { Authorization: `Bearer ${ctx.auth.testToken}` },
    );
    const capabilities = (await core.json()).capabilities;

    const res = await getWarm(
      request,
      `${NEXUS}/api/students/${ctx.studentId}/finance?classroom=${ctx.classroomId}`,
      { Authorization: `Bearer ${ctx.auth.testToken}` },
    );

    if (capabilities?.finance) {
      // This account holds the capability, so the denial path cannot be
      // exercised here. Assert the allow path instead, and say so rather than
      // reporting a pass for something that was never checked.
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('agreed');
      expect(body).toHaveProperty('paid');
      expect(body).toHaveProperty('balance');
      test.info().annotations.push({
        type: 'note',
        description:
          'Test account holds coord.student.finance, so the allow path was asserted. The denial path is covered by the student-token case below and by the unit tests in staff-capabilities.test.ts.',
      });
    } else {
      // 403 and NOT 401. The route used to answer 401 for every failure, which
      // turned "you may not see this" into "your session expired".
      expect(res.status()).toBe(403);
      expect((await res.json()).error).toContain('coord.student.finance');
    }
  });

  test('a student token is refused on all three routes with 403', async ({ request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    const student = await getTestAuthToken(request, 'student');
    if (!student) {
      test.skip(true, 'student test-login unavailable');
      return;
    }

    const headers = { Authorization: `Bearer ${student.testToken}` };
    for (const path of ['', '/finance', '/performance']) {
      const res = await getWarm(
        request,
        `${NEXUS}/api/students/${ctx.studentId}${path}?classroom=${ctx.classroomId}`,
        headers,
      );
      expect(res.status(), `student reached ${path || '/core'}`).toBe(403);
    }
  });

  test('no token at all is 401, which is a different answer from 403', async ({ request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }

    for (const path of ['', '/finance', '/performance']) {
      const res = await getWarm(
        request,
        `${NEXUS}/api/students/${ctx.studentId}${path}?classroom=${ctx.classroomId}`,
      );
      expect(res.status(), `unauthenticated ${path || '/core'}`).toBe(401);
    }
  });

  test('performance is teaching data, so a capable staff member always gets it', async ({
    request,
  }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }

    // Only money is gated. Gating attendance too would break the whole point of
    // the page for a visiting teacher.
    const res = await getWarm(
      request,
      `${NEXUS}/api/students/${ctx.studentId}/performance?classroom=${ctx.classroomId}`,
      { Authorization: `Bearer ${ctx.auth.testToken}` },
    );
    expect(res.status()).toBe(200);

    const serialised = JSON.stringify(await res.json());
    const leaked = COMMERCIAL_COLUMNS.filter((c) => serialised.includes(c));
    expect(leaked, `commercial columns leaked into performance: ${leaked.join(', ')}`).toEqual([]);
  });
});

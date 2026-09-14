import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Reading a proposed application form before merging two records for good.
 *
 * WHAT IS WORTH PROVING IN A BROWSER
 *
 * "Yes, this is their form" runs merge_user_records and cannot be undone, so the
 * reviewer has to be able to READ the form first. The unit tests already cover
 * who agrees with whom (describeAgreement) and what is masked (maskPhone,
 * maskEmail). What they cannot show is that the form reaches the screen, that
 * the drill-down does not strand a reviewer in a dead end, and that the finance
 * gate holds on the wire.
 *
 * THE GATE TEST IS THE IMPORTANT ONE. The detail route reads lead_profiles
 * through LEAD_PROFILE_PUBLIC_COLUMNS. If someone later "simplifies" that to
 * select('*'), every assertion about what the screen renders would still pass
 * while fee, scholarship, caste and utm_* values quietly started crossing to the
 * client. So the response body is asserted directly, not just the pixels.
 *
 * NO networkidle. The Nexus dev server holds an HMR socket open, so that state
 * never arrives and every wait on it burns the whole timeout. Wait for the
 * element that matters instead.
 *
 * SKIPPING RATHER THAN PRETENDING. A classroom where every student already has a
 * form is the healthy state. These tests skip with the reason rather than
 * failing, so a green run never means "the sheet works" when it really means
 * "there was nothing to review".
 */

// A cold Next dev server compiles a route on first hit, which alone can outlast
// the 30s default before the first assertion is even reached.
test.describe.configure({ mode: 'serial', timeout: 180_000 });

/** Columns that must never cross to the client: see lib/student-finance.ts. */
const FINANCE_KEYS = [
  'assigned_fee',
  'final_fee',
  'discount_amount',
  'coupon_code',
  'caste_category',
  'scholarship_eligible',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'referral_code',
  'payment_scheme',
  'total_cashback_eligible',
];

/**
 * Wait for a locator, and report whether it turned up.
 *
 * NOT locator.isVisible(): that reads the CURRENT state and returns at once,
 * ignoring its timeout entirely. Used as a wait it always answers "no" against a
 * roster that is still loading, and every test here skipped itself green.
 */
async function shown(locator: ReturnType<Page['getByRole']>, timeout: number): Promise<boolean> {
  return locator
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

async function openStudents(page: Page): Promise<void> {
  await page.goto(`${APP_URLS.nexus}/teacher/students`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
}

/** The classroom and token injectAuthForPage put on the origin. */
async function session(page: Page): Promise<{ token: string | null; classroom: string | null }> {
  return page.evaluate(() => ({
    token: localStorage.getItem('nexus_test_token'),
    classroom: localStorage.getItem('nexus_active_classroom_id'),
  }));
}

/**
 * Open the review sheet and the first proposed form inside it. Returns the
 * reason to skip, or null when the form is on screen.
 */
async function openFirstForm(page: Page): Promise<string | null> {
  await openStudents(page);

  // NeedsAttentionCard starts collapsed on a phone (useState(isPhone)), so on
  // this viewport the entry button does not exist until it is opened. Waiting
  // for it without expanding is how this spec silently skipped its own subject.
  const toggle = page.getByRole('button', { name: /needs attention/i }).first();
  if (!(await shown(toggle, 120_000))) return 'Nothing needs attention in this classroom.';
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();

  const entry = page.getByRole('button', { name: /find their forms/i }).first();
  if (!(await shown(entry, 30_000))) return 'No student in this classroom is missing an application form.';
  await entry.click();

  const view = page.getByRole('button', { name: /view full form/i }).first();
  if (!(await shown(view, 30_000))) return 'No candidate form was proposed to review.';
  await view.click();
  await expect(page.getByText('Does this match?')).toBeVisible({ timeout: 60_000 });
  return null;
}

test.describe('Application form review', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Could not get a teacher test token for this environment.');
  });

  test('a proposed form can be opened and read before it is linked', async ({ page }) => {
    const skip = await openFirstForm(page);
    test.skip(!!skip, skip || '');

    // The question the screen exists to answer comes before the form itself.
    await expect(page.getByRole('button', { name: /back to the list/i })).toBeVisible();
    for (const heading of ['Application', 'Who filled it in', 'What they are studying', 'Where they live']) {
      await expect(page.getByRole('region', { name: heading })).toBeVisible();
    }
  });

  test('back and Escape return to the list rather than closing the whole sheet', async ({ page }) => {
    const skip = await openFirstForm(page);
    test.skip(!!skip, skip || '');

    await page.getByRole('button', { name: /back to the list/i }).click();
    await expect(page.getByText('Does this match?')).toBeHidden();
    await expect(page.getByRole('button', { name: /view full form/i }).first()).toBeVisible();

    // Escape pops the form first, and leaves the sheet standing.
    await page.getByRole('button', { name: /view full form/i }).first().click();
    await expect(page.getByText('Does this match?')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByText('Does this match?')).toBeHidden();
    await expect(page.getByRole('button', { name: /view full form/i }).first()).toBeVisible();
  });

  test('mobile: the form does not scroll sideways and its controls are tappable', async ({ page }) => {
    const skip = await openFirstForm(page);
    test.skip(!!skip, skip || '');

    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, '[role="dialog"] button:visible', 44);
  });

  test('the detail route serves no fee, scholarship or marketing field', async ({ page }) => {
    await openStudents(page);
    const { token, classroom } = await session(page);
    test.skip(!token || !classroom, 'No test token or active classroom on this origin.');

    // Take a real (student, form) pair from the list route, so the request is one
    // the matcher would actually propose. Anything else is refused by design.
    const pair = await page.evaluate(
      async ({ token, classroom }: { token: string; classroom: string }) => {
        const res = await fetch(`/api/students/application-forms?classroom=${classroom}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const body = (await res.json()) as {
          students: Array<{ id: string; candidates: Array<{ userId: string }> }>;
        };
        const hit = (body.students || []).find((s) => s.candidates?.length);
        return hit ? { student: hit.id, form: hit.candidates[0].userId } : null;
      },
      { token: token!, classroom: classroom! },
    );
    test.skip(!pair, 'No proposed form is available in this environment to probe.');

    const detail = await page.evaluate(
      async ({ token, classroom, student, form }: Record<string, string>) => {
        const res = await fetch(
          `/api/students/application-forms/detail?classroom=${classroom}&student=${student}&form=${form}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        return { status: res.status, text: await res.text() };
      },
      { token: token!, classroom: classroom!, student: pair!.student, form: pair!.form },
    );

    expect(detail.status).toBe(200);
    for (const key of FINANCE_KEYS) {
      expect(detail.text, `${key} must not cross to the client`).not.toContain(`"${key}"`);
    }
    // It really did answer with a form, so the assertions above mean something.
    expect(detail.text).toContain('"agreement"');
  });

  test('a pair the matcher would not propose is refused', async ({ page }) => {
    await openStudents(page);
    const { token, classroom } = await session(page);
    test.skip(!token || !classroom, 'No test token or active classroom on this origin.');

    const status = await page.evaluate(
      async ({ token, classroom }: Record<string, string>) => {
        const fake = '00000000-0000-4000-8000-000000000000';
        const res = await fetch(
          `/api/students/application-forms/detail?classroom=${classroom}&student=${fake}&form=${fake}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        return res.status;
      },
      { token: token!, classroom: classroom! },
    );
    expect([400, 403, 404]).toContain(status);
  });
});

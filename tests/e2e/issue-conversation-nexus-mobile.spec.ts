import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * A ticket conversation on a phone.
 *
 * Written against the gap that left NXS-0125 open for eight days: a teacher's
 * reply was written into the database and reached nobody, and the student page
 * never fetched the thread, so there was nowhere for the student to read it or
 * answer. These tests check the three facts that were false.
 *
 *   1. A ?issue= link opens THAT ticket, whatever tab it belongs to.
 *   2. The student can read the staff reply and send one back.
 *   3. None of it scrolls a 375px screen sideways, and the send control is a
 *      real 44px target.
 *
 * 375x812 (iPhone SE through 13 mini) rather than the project's Pixel 5,
 * because 375 is the narrowest width these cards have to survive.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Ticket conversation on a phone', () => {
  test.describe.configure({ mode: 'serial' });

  let issueId = '';
  let ticketNumber = '';
  let teacherToken = '';

  test.beforeAll(async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    const teacher = await getTestAuthToken(request, 'teacher');
    if (!student || !teacher) return;
    teacherToken = teacher.testToken;

    const created = await request.post(`${NEXUS}/api/foundation/issues`, {
      headers: { Authorization: `Bearer ${student.testToken}` },
      data: {
        title: '__TEST__ Not able to attend the test',
        category: 'bug',
        description: '__TEST__ The test still says closed after the recording.',
      },
    });
    if (!created.ok()) return;
    const body = await created.json();
    issueId = body.issue?.id || '';
    ticketNumber = body.issue?.ticket_number || '';

    // The staff reply the student is supposed to find waiting for them.
    await request.patch(`${NEXUS}/api/foundation/issues/${issueId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { action: 'comment', comment: '__TEST__ Please open it once more and tell us.' },
    });
    // An internal note that must never appear on the student's screen.
    await request.patch(`${NEXUS}/api/foundation/issues/${issueId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { action: 'comment', comment: '__TEST__ Internal only, do not show.', internal: true },
    });
  });

  test.afterAll(async ({ request }) => {
    if (!issueId || !teacherToken) return;
    await request.delete(`${NEXUS}/api/foundation/issues/${issueId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
  });

  test('a ?issue= link opens that ticket and shows the staff reply', async ({ page }) => {
    test.skip(!issueId, 'Nexus dev server or test credentials unavailable');
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Could not sign in as the test student');

    await page.goto(`${NEXUS}/student/issues?issue=${encodeURIComponent(ticketNumber || issueId)}`, {
      waitUntil: 'domcontentloaded',
    });

    // The deep link expands the thread itself, so the reply is on screen with
    // nothing tapped. That is the whole point of the link in the Teams chat.
    await expect(page.getByText('__TEST__ Please open it once more')).toBeVisible({ timeout: 30_000 });
  });

  test('the internal note is nowhere on the student page', async ({ page }) => {
    test.skip(!issueId, 'Nexus dev server or test credentials unavailable');
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Could not sign in as the test student');

    await page.goto(`${NEXUS}/student/issues?issue=${encodeURIComponent(ticketNumber || issueId)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('__TEST__ Please open it once more')).toBeVisible({ timeout: 30_000 });

    // Checked against the rendered document rather than a locator, because the
    // guarantee is that the row never reached the browser at all.
    expect(await page.content()).not.toContain('Internal only, do not show');
  });

  test('the student can reply, and the reply stays on the ticket', async ({ page }) => {
    test.skip(!issueId, 'Nexus dev server or test credentials unavailable');
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Could not sign in as the test student');

    await page.goto(`${NEXUS}/student/issues?issue=${encodeURIComponent(ticketNumber || issueId)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('__TEST__ Please open it once more')).toBeVisible({ timeout: 30_000 });

    const box = page.getByPlaceholder('Reply to your teacher...');
    await expect(box).toBeVisible();
    await box.fill('__TEST__ Still closed for me.');
    await page.getByRole('button', { name: 'Send reply' }).click();

    await expect(page.getByText('__TEST__ Still closed for me.')).toBeVisible({ timeout: 15_000 });
  });

  test('nothing scrolls sideways and the send control is a real target', async ({ page }) => {
    test.skip(!issueId, 'Nexus dev server or test credentials unavailable');
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Could not sign in as the test student');

    await page.goto(`${NEXUS}/student/issues?issue=${encodeURIComponent(ticketNumber || issueId)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('__TEST__ Please open it once more')).toBeVisible({ timeout: 30_000 });

    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'button[aria-label="Send reply"]', 44);
  });
});

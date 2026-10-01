import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The support ticket lifecycle, end to end, at phone width.
 *
 *   New -> Start working -> Ask student -> student replies (back to staff)
 *       -> Mark resolved (outcome) -> student confirms -> Closed
 *       -> student reopens inside the window -> staff Close now (outcome)
 *
 * What it protects:
 *  - each move lands the status the lifecycle says, and a stale move answers 409;
 *  - the student's own thread shows every move (picked up, the question, their
 *    reply, the resolution), never an internal row;
 *  - a student cannot make a staff move;
 *  - both issues screens fit 375px with no sideways scroll, and the controls a
 *    thumb needs are at least 44px;
 *  - Mark resolved opens with the outcome's note already written, and a new
 *    outcome swaps it;
 *  - a closed ticket still takes the student's reply (NXS-0126);
 *  - "Still happening" carries a device snapshot that only staff can read.
 *
 * API steps use the test-login tokens, so the Entra MFA wall does not apply.
 * Needs the Nexus dev server on :3012 and the 20261020090000 migration applied
 * to the database it points at. Self-skips when the server is not there.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const SHOTS = process.env.E2E_SHOT_DIR || '';

async function skipTour(page: import('@playwright/test').Page) {
  // The first-run welcome tour is a modal: while it is open MUI marks the rest
  // of the app aria-hidden and every getByRole finds nothing.
  const skip = page.getByRole('button', { name: /^skip$/i });
  if (await skip.count()) {
    await skip.first().click();
    await expect(skip.first()).toBeHidden({ timeout: 15_000 });
  }
}

test.describe('Ticket lifecycle', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: NEXUS, viewport: PHONE });

  let studentToken = '';
  let teacherToken = '';
  let issueId = '';
  let ticket = '';

  test('setup: tokens and a fresh ticket', async ({ request }) => {
    const s = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
      failOnStatusCode: false,
    }).catch(() => null);
    test.skip(!s || s.status() !== 200, 'Nexus dev server with test login is not reachable');
    studentToken = (await s!.json()).testToken;

    const t = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    teacherToken = (await t.json()).testToken;

    const created = await request.post('/api/foundation/issues', {
      headers: auth(studentToken),
      data: {
        title: '__TEST__ lifecycle: drawing streak shows the wrong day',
        description: '__TEST__ It says day 1 but I drew on two days this week.',
        category: 'bug',
        page_url: '/student/sketchbook',
      },
    });
    expect(created.status()).toBe(201);
    const body = await created.json();
    issueId = body.issue.id;
    ticket = body.issue.ticket_number;
    expect(body.issue.status).toBe('open');
  });

  test('teacher screen at 375px: queue cards and the next step fit', async ({ page }) => {
    test.skip(!issueId, 'no ticket');
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'teacher test auth unavailable');

    await page.goto(`${NEXUS}/teacher/issues?issue=${ticket}`, { waitUntil: 'domcontentloaded' });
    const queue = page.getByRole('group', { name: 'Filter tickets by status' });
    await expect(queue).toBeVisible({ timeout: 90_000 });
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, '[aria-label="Filter tickets by status"] > button', 44);

    const nextStep = page.getByTestId('issue-next-step');
    await expect(nextStep).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('issue-primary-action')).toHaveText(/Start working/);
    await assertTouchTargetSize(page, '[data-testid="issue-primary-action"]', 44);
    await expect(page.getByRole('list', { name: 'Ticket progress' }).first()).toBeVisible();
  });

  test('a student cannot make a staff move', async ({ request }) => {
    test.skip(!issueId, 'no ticket');
    const res = await request.patch(`/api/foundation/issues/${issueId}`, {
      headers: auth(studentToken),
      data: { action: 'start' },
      failOnStatusCode: false,
    });
    expect(res.ok()).toBe(false);
  });

  test('Start working: in progress, and the student sees who picked it up', async ({ request }) => {
    test.skip(!issueId, 'no ticket');
    const res = await request.patch(`/api/foundation/issues/${issueId}`, {
      headers: auth(teacherToken),
      data: { action: 'start' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issue.status).toBe('in_progress');
    expect(body.issue.assigned_to).toBeTruthy();

    const view = await (await request.get(`/api/foundation/issues/${issueId}`, { headers: auth(studentToken) })).json();
    expect(view.activity.map((a: { action: string }) => a.action)).toContain('accepted');
  });

  test('Start working twice answers 409', async ({ request }) => {
    test.skip(!issueId, 'no ticket');
    const res = await request.patch(`/api/foundation/issues/${issueId}`, {
      headers: auth(teacherToken),
      data: { action: 'start' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(409);
  });

  test('Ask student: waiting on the student, closing in about 7 days', async ({ request }) => {
    test.skip(!issueId, 'no ticket');
    const res = await request.patch(`/api/foundation/issues/${issueId}`, {
      headers: auth(teacherToken),
      data: { action: 'request_info', message: '__TEST__ Which device are you on?' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issue.status).toBe('waiting_on_student');
    const days = (new Date(body.issue.auto_close_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.5);
    expect(days).toBeLessThan(7.5);
  });

  test('student screen at 375px: the ticket asks for a reply', async ({ page }) => {
    test.skip(!issueId, 'no ticket');
    test.skip(!(await injectAuthForPage(page, 'student')), 'student test auth unavailable');

    await page.goto(`${NEXUS}/student/issues?issue=${ticket}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/needs more from you/i).first()).toBeVisible({ timeout: 90_000 });
    // The first-run welcome tour is a modal: while it is open MUI marks the rest
    // of the app aria-hidden and every getByRole below finds nothing.
    const skip = page.getByRole('button', { name: /^skip$/i });
    if (await skip.count()) {
      await skip.first().click();
      await expect(skip.first()).toBeHidden({ timeout: 15_000 });
    }
    await assertNoHorizontalOverflow(page);
    const reply = page.getByRole('button', { name: /^reply$/i }).first();
    await expect(reply).toBeVisible();
    const box = await reply.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('list', { name: 'Ticket progress' }).first()).toBeVisible();
  });

  test("the student's reply hands the ticket back to staff", async ({ request }) => {
    test.skip(!issueId, 'no ticket');
    const res = await request.patch(`/api/foundation/issues/${issueId}`, {
      headers: auth(studentToken),
      data: { action: 'comment', comment: '__TEST__ Chrome on Android.' },
    });
    expect(res.status()).toBe(200);

    const view = await (await request.get(`/api/foundation/issues/${issueId}`, { headers: auth(studentToken) })).json();
    expect(view.issue.status).toBe('in_progress');
    expect(view.issue.auto_close_at).toBeNull();
    const actions = view.activity.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['info_requested', 'student_replied']));
    // Nothing internal is ever served to the reporter.
    expect(view.activity.every((a: { visible_to_student: boolean }) => a.visible_to_student)).toBe(true);
  });

  test('Mark resolved opens with the outcome note written, and a new outcome swaps it', async ({ page }) => {
    test.skip(!issueId, 'no ticket');
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'teacher test auth unavailable');

    await page.goto(`${NEXUS}/teacher/issues?issue=${ticket}`, { waitUntil: 'domcontentloaded' });
    const primary = page.getByTestId('issue-primary-action');
    await expect(primary).toHaveText(/Mark resolved/, { timeout: 90_000 });
    await primary.click();

    const note = page.getByRole('textbox', { name: /Note to the student/ });
    await expect(note).toHaveValue(/fixed this/i);
    await expect(page.getByText('Quick replies')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/resolve-sheet-375.png` });

    await page.getByRole('radio', { name: 'Answered' }).click();
    await expect(note).toHaveValue(/answered your question/i);

    // Words the teacher typed are never replaced by a template.
    await note.fill('My own note');
    await page.getByRole('radio', { name: 'Duplicate' }).click();
    await expect(note).toHaveValue('My own note');
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Mark resolved with an outcome, then the student confirms', async ({ request }) => {
    test.skip(!issueId, 'no ticket');
    const resolved = await request.patch(`/api/foundation/issues/${issueId}`, {
      headers: auth(teacherToken),
      data: { action: 'resolve', resolution_code: 'fixed', resolution_note: '__TEST__ Streaks now count in IST.' },
    });
    expect(resolved.status()).toBe(200);
    const r = await resolved.json();
    expect(r.issue.status).toBe('awaiting_confirmation');
    expect(r.issue.resolution_code).toBe('fixed');

    const confirmed = await request.patch(`/api/foundation/issues/${issueId}`, {
      headers: auth(studentToken),
      data: { action: 'confirm' },
    });
    expect(confirmed.status()).toBe(200);
    expect((await confirmed.json()).issue.status).toBe('closed');
  });

  test('a closed ticket still takes the student reply, without reopening it', async ({ page, request }) => {
    test.skip(!issueId, 'no ticket');
    test.skip(!(await injectAuthForPage(page, 'student')), 'student test auth unavailable');

    await page.goto(`${NEXUS}/student/issues?issue=${ticket}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(ticket).first()).toBeVisible({ timeout: 90_000 });
    await skipTour(page);
    const toggle = page.getByRole('button', { name: /^(Conversation|Hide conversation)$/ }).first();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    const box = page.getByPlaceholder('Reply to your teacher...').first();
    await expect(box).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/This ticket is closed\. Your teacher still gets your message/)).toBeVisible();
    await assertNoHorizontalOverflow(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/closed-reply-375.png`, fullPage: true });

    const res = await request.patch(`/api/foundation/issues/${issueId}`, {
      headers: auth(studentToken),
      data: { action: 'comment', comment: '__TEST__ Checked it, all good now sir.' },
    });
    expect(res.status()).toBe(200);
    const view = await (await request.get(`/api/foundation/issues/${issueId}`, { headers: auth(studentToken) })).json();
    expect(view.issue.status).toBe('closed');
  });

  test('the student can reopen a just-closed ticket; it goes back to its owner with a device snapshot', async ({ request }) => {
    test.skip(!issueId, 'no ticket');
    const res = await request.patch(`/api/foundation/issues/${issueId}`, {
      headers: auth(studentToken),
      data: {
        action: 'reopen',
        reason: '__TEST__ It says day 1 again today.',
        page_url: '/student/issues',
        device_info: { device_type: 'mobile', browser: 'Chrome', os: 'Android' },
        console_logs: [{ level: 'error', message: '__TEST__ HTTP 500 /api/sketchbook/streak', at: new Date().toISOString() }],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issue.status).toBe('in_progress');
    expect(body.issue.resolution_code ?? null).toBeNull();

    // Staff read the snapshot; the student's own copy never carries it.
    const staffView = await (await request.get(`/api/foundation/issues/${issueId}`, { headers: auth(teacherToken) })).json();
    // Staging has drifted without the `context` column (prod has it). The
    // reopen must still work there, which is asserted above; the snapshot
    // itself can only be checked where the column exists.
    if (!('context' in staffView.issue)) {
      test.info().annotations.push({ type: 'skipped-part', description: 'no context column on this database' });
      return;
    }
    const reopens = staffView.issue.context?.reopens || [];
    expect(reopens).toHaveLength(1);
    expect(reopens[0].console_logs[0].message).toContain('/api/sketchbook/streak');
    expect(reopens[0].reason).toContain('day 1 again');
    const studentView = await (await request.get(`/api/foundation/issues/${issueId}`, { headers: auth(studentToken) })).json();
    expect(studentView.issue.context).toBeUndefined();
  });

  test('Close now with an outcome, no confirmation asked', async ({ request }) => {
    test.skip(!issueId, 'no ticket');
    const refused = await request.patch(`/api/foundation/issues/${issueId}`, {
      headers: auth(teacherToken),
      data: { action: 'close', resolution_code: 'no_response', note: '__TEST__ x' },
      failOnStatusCode: false,
    });
    expect(refused.status()).toBe(400);

    const res = await request.patch(`/api/foundation/issues/${issueId}`, {
      headers: auth(teacherToken),
      data: { action: 'close', resolution_code: 'duplicate', note: '__TEST__ Same as the streak ticket.' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issue.status).toBe('closed');
    expect(body.issue.resolution_code).toBe('duplicate');
    expect(body.issue.auto_close_at).toBeNull();
  });

  test('cleanup', async ({ request }) => {
    test.skip(!issueId, 'no ticket');
    const res = await request.delete(`/api/foundation/issues/${issueId}`, { headers: auth(teacherToken) });
    expect(res.status()).toBe(200);
  });
});


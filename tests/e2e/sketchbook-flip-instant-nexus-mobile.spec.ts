import { test, expect, type Page, type Request } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Flip through answers a reaction at once, and Class rhythm says who Nexus
 * reminded (2026-09-22).
 *
 * The inbox, react and flip routes are mocked with page.route, so no student is
 * messaged on Teams by a test and the react route can be made deliberately slow:
 * the card must move on before the server answers, the send must wait out the
 * Undo window, and Undo must send nothing at all.
 */

const NEXUS = APP_URLS.nexus;
const IMAGE = `${NEXUS}/icons/icon-512x512.png`;
const SCRATCH_SHOTS = process.env.PW_SHOTS_DIR;

test.describe.configure({ timeout: 180_000 });

const sketch = (id: string, name: string) => ({
  id,
  student_id: `stu-${id}`,
  original_image_url: IMAGE,
  thumbnail_url: IMAGE,
  self_note: null,
  reaction: null,
  submitted_at: '2026-09-15T14:44:43.000Z',
  is_gallery_visible: false,
  source_type: 'sketchbook',
  status: 'completed',
  assignment_id: null,
  question_id: null,
  reviewed_at: null,
  tutor_rating: null,
  tutor_marks: null,
  inspiration_item_id: null,
  assignment: null,
  student: { id: `stu-${id}`, name, avatar_url: null, ms_oid: null },
  featured: [],
});

interface Sent { id: string; body: Record<string, unknown>; at: number }

async function mockFlip(page: Page): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route('**/api/sketchbook/inbox**', (route) =>
    route.fulfill({
      json: { sketches: [sketch('a1', 'Poheem Tapo'), sketch('b2', 'Kathir Muraliraja'), sketch('c3', 'Iswarya P')], remaining: 0 },
    }),
  );
  await page.route('**/api/sketchbook/entries/*/react', async (route) => {
    const req: Request = route.request();
    const id = req.url().split('/entries/')[1].split('/')[0];
    sent.push({ id, body: req.postDataJSON(), at: Date.now() });
    // Slower than a real Teams chain on a bad day: the screen must not wait for it.
    await new Promise((r) => setTimeout(r, 3000));
    await route.fulfill({ json: { reaction: req.postDataJSON()?.reaction ?? null } });
  });
  await page.route('**/api/sketchbook/entries/*/flip', (route) => route.fulfill({ json: { ok: true } }));
  return sent;
}

async function openFlip(page: Page): Promise<boolean> {
  if (!(await injectAuthForPage(page, 'teacher'))) return false;
  await page.goto(`${NEXUS}/teacher/sketchbook`, { waitUntil: 'domcontentloaded' });
  try {
    await page.getByText('1 of 3').waitFor({ timeout: 120_000 });
  } catch {
    return false;
  }
  return true;
}

test.describe('Flip through on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('a reaction moves on before the server answers, and sends once the Undo window closes', async ({ page }, testInfo) => {
    const sent = await mockFlip(page);
    test.skip(!(await openFlip(page)), 'Nexus not running or no classroom picked');

    const tapped = Date.now();
    await page.getByRole('button', { name: 'Wow' }).click();
    await expect(page.getByText('2 of 3')).toBeVisible({ timeout: 1500 });
    expect(Date.now() - tapped).toBeLessThan(1500);
    const status = page.getByTestId('flip-status');
    await expect(status).toContainText('Wow for Poheem');
    expect(sent).toHaveLength(0);

    await assertNoHorizontalOverflow(page);
    const undo = page.getByRole('button', { name: 'Undo' });
    expect(((await undo.boundingBox())?.height ?? 0) >= 44).toBe(true);
    for (const name of ['Nice', 'Great', 'Wow']) {
      expect(((await page.getByRole('button', { name }).boundingBox())?.height ?? 0) >= 44).toBe(true);
    }
    if (SCRATCH_SHOTS) await page.screenshot({ path: `${SCRATCH_SHOTS}/flip-phone-held.png` });
    await page.screenshot({ path: testInfo.outputPath('flip-phone-held.png') });

    await expect.poll(() => sent.length, { timeout: 8000 }).toBe(1);
    expect(sent[0].id).toBe('a1');
    expect(sent[0].body).toEqual({ reaction: 'wow' });
    expect(sent[0].at - tapped).toBeGreaterThanOrEqual(3500);
  });

  test('Undo inside the window sends nothing and goes back to that sketch', async ({ page }) => {
    const sent = await mockFlip(page);
    test.skip(!(await openFlip(page)), 'Nexus not running or no classroom picked');

    await page.getByRole('button', { name: 'Great' }).click();
    await expect(page.getByText('2 of 3')).toBeVisible({ timeout: 1500 });
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('1 of 3')).toBeVisible();
    await page.waitForTimeout(5500);
    expect(sent).toHaveLength(0);
  });

  test('a comment can go on its own and the card still moves on', async ({ page }) => {
    const sent = await mockFlip(page);
    test.skip(!(await openFlip(page)), 'Nexus not running or no classroom picked');

    await page.getByRole('button', { name: 'Comment' }).click();
    await page.getByLabel('Comment').fill('Softer shadow under the apple');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('2 of 3')).toBeVisible({ timeout: 1500 });
    await expect.poll(() => sent.length, { timeout: 8000 }).toBe(1);
    expect(sent[0].body).toEqual({ comment: 'Softer shadow under the apple' });
  });
});

test.describe('Flip through on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('1, 2 and 3 react from the keyboard', async ({ page }) => {
    const sent = await mockFlip(page);
    test.skip(!(await openFlip(page)), 'Nexus not running or no classroom picked');

    await page.keyboard.press('3');
    await expect(page.getByText('2 of 3')).toBeVisible({ timeout: 1500 });
    await page.keyboard.press('2');
    await expect(page.getByText('3 of 3')).toBeVisible({ timeout: 1500 });
    await expect.poll(() => sent.map((s) => [s.id, s.body.reaction]).sort(), { timeout: 10_000 })
      .toEqual([['a1', 'wow'], ['b2', 'fire']]);
  });
});

test.describe('Class rhythm says who was reminded', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const strip = Array.from({ length: 14 }, (_, i) => ({ date: `2026-09-${String(9 + i).padStart(2, '0')}`, state: i < 7 ? 'drew' : 'missed', today: i === 13 }));
  const student = (id: string, name: string, over: Record<string, unknown>) => ({
    userId: id, name, email: null, avatarUrl: null, msOid: null, enrolledAt: '2026-06-01T00:00:00Z', start: '2026-09-12',
    status: 'needs_nudge', label: 'Quiet 7 days', quietDays: 7, lastDrawingDate: '2026-09-15', week: { count: 0, goal: 3 },
    strip, run: 0, remindersThisCycle: 0, remindersSentThisCycle: 0, lastRemindedOn: null, lastReminderChannel: null,
    latestSketch: null, ...over,
  });

  test('quiet rows say whether Nexus reminded them, and the rows stay compact', async ({ page }) => {
    await page.route('**/api/sketchbook/class-rhythm**', (route) =>
      route.fulfill({
        json: {
          goal: 3, startedOn: '2026-09-12', today: '2026-09-22', pausedCount: 0,
          students: [
            student('11111111-1111-4111-8111-111111111111', 'Iswarya Palaniappan', {}),
            student('22222222-2222-4222-8222-222222222222', 'Jeshurun Winsley', {
              remindersThisCycle: 2, remindersSentThisCycle: 2, lastRemindedOn: '2026-09-20', lastReminderChannel: 'chat+inapp',
            }),
          ],
        },
      }),
    );
    if (!(await injectAuthForPage(page, 'teacher'))) test.skip(true, 'Nexus not running');
    await page.goto(`${NEXUS}/teacher/sketchbook?view=rhythm`, { waitUntil: 'domcontentloaded' });
    const rows = page.getByTestId('rhythm-row');
    try {
      await rows.first().waitFor({ timeout: 120_000 });
    } catch {
      test.skip(true, 'No classroom picked');
    }

    // On a phone the story is a bell mark on the name line, with the sentence as its tooltip.
    const marks = page.getByTestId('rhythm-row-reminder-mark');
    await expect(marks).toHaveCount(2);
    await expect(marks.first()).toBeVisible();
    await expect(marks.first()).toHaveAttribute('title', 'Not reminded yet');
    await expect(marks.nth(1)).toHaveAttribute('title', /^Reminded 2 times, last 20 Sept?, Teams chat$/);
    await expect(marks.nth(1)).toHaveText('2');
    await expect(page.getByTestId('rhythm-row-reminders').first()).toBeHidden();
    // The row still says it to a screen reader.
    await expect(rows.first().getByRole('link').first()).toHaveAttribute('aria-label', /Not reminded yet\./);

    // The E2E session turns every feature on (useNexusAuth test mode), so the
    // off notice must stay away here; its off state is covered by
    // ClassRhythmList.test.tsx, where the flag can be set either way.
    await expect(page.getByTestId('auto-reminders-off')).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
    for (const i of [0, 1]) {
      const box = await rows.nth(i).boundingBox();
      expect(box && box.height <= 76).toBe(true);
    }
    if (SCRATCH_SHOTS) await page.screenshot({ path: `${SCRATCH_SHOTS}/rhythm-phone-reminders.png` });
  });

  test('on a laptop the reminder is a sentence', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.route('**/api/sketchbook/class-rhythm**', (route) =>
      route.fulfill({
        json: {
          goal: 3, startedOn: '2026-09-12', today: '2026-09-22', pausedCount: 0,
          students: [
            student('22222222-2222-4222-8222-222222222222', 'Jeshurun Winsley', {
              remindersThisCycle: 1, remindersSentThisCycle: 1, lastRemindedOn: '2026-09-20', lastReminderChannel: 'teams+inapp',
            }),
          ],
        },
      }),
    );
    if (!(await injectAuthForPage(page, 'teacher'))) test.skip(true, 'Nexus not running');
    await page.goto(`${NEXUS}/teacher/sketchbook?view=rhythm`, { waitUntil: 'domcontentloaded' });
    const sentence = page.getByTestId('rhythm-row-reminders').first();
    try {
      await sentence.waitFor({ state: 'attached', timeout: 120_000 });
    } catch {
      test.skip(true, 'No classroom picked');
    }
    await expect(sentence).toBeVisible();
    await expect(sentence).toHaveText(/^Reminded once, last 20 Sept?, Teams alert$/);
    await expect(page.getByTestId('rhythm-row-reminder-mark').first()).toBeHidden();
    if (SCRATCH_SHOTS) await page.screenshot({ path: `${SCRATCH_SHOTS}/rhythm-laptop-reminders.png` });
  });
});

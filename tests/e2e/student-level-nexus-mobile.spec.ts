import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Student levels (2026-09-30): the overall level as bars on the avatar, the
 * snapshot a tap opens, and the manager-only Levels screen.
 *
 * The level routes are mocked with page.route, so no real student's level is
 * written by a test and the screens can be driven from a known class. The
 * access tests at the bottom hit the real routes.
 */

const NEXUS = APP_URLS.nexus;
const IMAGE = `${NEXUS}/icons/icon-512x512.png`;
const SCRATCH_SHOTS = process.env.PW_SHOTS_DIR;

test.describe.configure({ timeout: 180_000 });

const fact = (name: string, level: string | null) => ({
  stage: '12th',
  dormant: false,
  photo: null,
  name,
  language: 'tamil',
  limitedEnglish: false,
  drawingLevel: level,
  overallLevel: level,
});

async function mockFacts(page: Page) {
  await page.route('**/api/students/stage-facts**', (route) =>
    route.fulfill({ json: { facts: { 'stu-a1': fact('Poheem Tapo', 'mid'), 'stu-b2': fact('Iswarya P', null) }, count: 2 } }),
  );
}

const drawing = (id: string, studentId: string) => ({
  id,
  studentId,
  thumbUrl: IMAGE,
  imageUrl: IMAGE,
  submittedAt: '2026-09-29T10:00:00.000Z',
  sourceType: 'sketchbook',
});

async function mockSnapshot(page: Page) {
  await page.route('**/api/students/*/snapshot', (route) =>
    route.fulfill({
      json: {
        studentId: 'stu-a1',
        levels: {
          drawing: { level: 'mid', note: null, setAt: '2026-09-29T10:00:00.000Z', setBy: { id: 'm1', name: 'Hari Babu' } },
        },
        overallLevel: 'mid',
        history: [],
        recentDrawings: [drawing('d1', 'stu-a1'), drawing('d2', 'stu-a1')],
      },
    }),
  );
}

async function mockInbox(page: Page) {
  await page.route('**/api/sketchbook/inbox**', (route) =>
    route.fulfill({
      json: {
        sketches: [
          {
            id: 'a1',
            student_id: 'stu-a1',
            original_image_url: IMAGE,
            thumbnail_url: IMAGE,
            self_note: null,
            reaction: null,
            submitted_at: '2026-09-29T10:00:00.000Z',
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
            student: { id: 'stu-a1', name: 'Poheem Tapo', avatar_url: null, ms_oid: null },
            featured: [],
          },
        ],
        remaining: 0,
      },
    }),
  );
  await page.route('**/api/sketchbook/entries/*/flip', (route) => route.fulfill({ json: { ok: true } }));
}

async function avatarAndSnapshot(page: Page, shot: string) {
  await mockFacts(page);
  await mockSnapshot(page);
  await mockInbox(page);
  test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test login unavailable');
  await page.goto(`${NEXUS}/teacher/sketchbook`, { waitUntil: 'domcontentloaded' });
  try {
    await page.getByText('1 of 1').waitFor({ timeout: 120_000 });
  } catch {
    test.skip(true, 'Nexus not running or no classroom picked');
  }

  const header = page.getByTestId('info-ring').first();
  await expect(header.getByTestId('level-badge')).toHaveAttribute('data-level', 'mid');
  await expect(page.getByText('Drawing: Mid').first()).toBeVisible();

  await header.click();
  const sheet = page.getByTestId('student-snapshot');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('snapshot-overall')).toContainText('Mid');
  await expect(sheet.getByTestId('snapshot-skill-aptitude')).toContainText('Not tracked yet');
  await expect(sheet.getByTestId('snapshot-skill-maths')).toContainText('JEE only');
  await expect(sheet.getByText('Set by Hari on')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  if (SCRATCH_SHOTS) await page.screenshot({ path: `${SCRATCH_SHOTS}/${shot}.png` });

  await sheet.getByRole('button', { name: 'Close snapshot' }).click();
  await expect(sheet).toBeHidden();
}

test.describe('Student level on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the avatar wears the bars and a tap opens the snapshot', async ({ page }) => {
    await avatarAndSnapshot(page, 'snapshot-375');
  });

  test('a manager sorts a class on the Levels tab, with Undo', async ({ page }) => {
    await mockFacts(page);
    const writes: Record<string, unknown>[] = [];
    await page.route('**/api/drawing-levels/queue**', (route) =>
      route.fulfill({
        json: {
          sinceDays: 90,
          students: [
            { id: 'stu-b2', name: 'Iswarya P', level: null, setAt: null, drawings: [drawing('d3', 'stu-b2')] },
            { id: 'stu-a1', name: 'Poheem Tapo', level: 'mid', setAt: '2026-09-29T10:00:00.000Z', drawings: [] },
          ],
        },
      }),
    );
    await page.route('**/api/students/*/skill-level', async (route) => {
      const body = route.request().postDataJSON();
      writes.push(body);
      await route.fulfill({
        json: { studentId: 'stu-b2', skill: 'drawing', level: body.level, previous: null, changed: true },
      });
    });
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test login unavailable');
    await page.goto(`${NEXUS}/teacher/sketchbook?view=levels`, { waitUntil: 'domcontentloaded' });
    try {
      await page.getByTestId('level-sort').waitFor({ timeout: 120_000 });
    } catch {
      test.skip(true, 'Levels tab not shown: Nexus not running, no classroom, or the test user lacks coord.student.level');
    }

    await expect(page.getByText('Iswarya P')).toBeVisible();
    await expect(page.getByText('1 of 2 sorted')).toBeVisible();
    if (SCRATCH_SHOTS) await page.screenshot({ path: `${SCRATCH_SHOTS}/levels-375.png`, fullPage: true });
    const top = page.getByTestId('level-choose-top');
    expect((await top.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await assertNoHorizontalOverflow(page);

    await top.click();
    await expect(page.getByText('Poheem Tapo')).toBeVisible();
    expect(writes[0]).toMatchObject({ skill: 'drawing', level: 'top', source: 'sort' });

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Iswarya P')).toBeVisible();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1]).toMatchObject({ level: null, source: 'sort' });
  });
});

test.describe('Student level on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the snapshot opens as a side panel', async ({ page }) => {
    await avatarAndSnapshot(page, 'snapshot-1280');
  });
});

test.describe('Student level access', () => {
  test('a student never reaches a snapshot or a level write', async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'Student test login unavailable');
    const headers = { Authorization: `Bearer ${student!.testToken}` };
    const snap = await request.get(`${NEXUS}/api/students/${student!.user.id}/snapshot`, { headers });
    expect([401, 403]).toContain(snap.status());
    const write = await request.put(`${NEXUS}/api/students/${student!.user.id}/skill-level`, {
      headers,
      data: { skill: 'drawing', level: 'top', source: 'sort' },
    });
    expect([401, 403]).toContain(write.status());
    const queue = await request.get(`${NEXUS}/api/drawing-levels/queue`, { headers });
    expect([401, 403]).toContain(queue.status());
  });
});

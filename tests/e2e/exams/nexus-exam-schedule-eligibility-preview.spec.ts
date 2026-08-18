import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../../utils/mobile-helpers';
import {
  seedEligibilityFixture,
  cleanupEligibilityFixture,
  type EligibilityFixture,
} from '../../utils/nexus-exam-eligibility-factory';

/**
 * "Preview who this is mandatory for" used to open a SwipeableDrawer nested
 * inside the still-open Schedule an exam Dialog. Both are independent MUI
 * portals, so the drawer (z-index 1200) always painted behind the dialog
 * (z-index 1300) and the teacher could never read or reach it.
 *
 * The fix swaps the Dialog's own content in place instead of stacking a
 * second overlay, so this spec drives the real Autocomplete flow a teacher
 * uses and asserts there is only ever one dialog portal on screen, and that
 * the roster (and its back control) are actually interactable, not just
 * present in the DOM.
 */

const DAY_MS = 86_400_000;

async function firstLibraryTestId(request: any, token: string): Promise<string | null> {
  const res = await request.get(`${APP_URLS.nexus}/api/question-bank/tests/library`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return null;
  const json = await res.json();
  const tests = json?.data?.tests ?? json?.data ?? [];
  return Array.isArray(tests) && tests.length > 0 ? tests[0].id : null;
}

async function classroomName(request: any, token: string, classroomId: string): Promise<string | null> {
  const res = await request.get(`${APP_URLS.nexus}/api/classrooms`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return null;
  const json = await res.json();
  const rooms = json?.classrooms ?? [];
  return rooms.find((r: any) => r.id === classroomId)?.name ?? null;
}

test.describe('Schedule an exam: mandatory-for preview', () => {
  // A cold Next dev server spends well over the default 30s budget compiling
  // /teacher/tests/[id] the first time anything visits it in a run.
  test.setTimeout(120_000);

  let teacherToken: string | null;
  let testId: string | null;
  let fixture: EligibilityFixture | null;

  test.beforeAll(async ({ request }) => {
    const t = await getTestAuthToken(request, 'teacher');
    teacherToken = t?.testToken ?? null;
    if (!teacherToken) return;
    testId = await firstLibraryTestId(request, teacherToken);
    fixture = await seedEligibilityFixture({
      studentEnrolledAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
    });
  });

  test.afterAll(async () => {
    if (fixture) await cleanupEligibilityFixture(fixture.classroomId);
  });

  test('the roster swaps in over the dialog, not behind it, and Back restores the form', async ({
    page,
    request,
  }) => {
    test.skip(!teacherToken || !testId || !fixture, 'No teacher token, paper, or fixture available in this environment');

    const roomName = await classroomName(request, teacherToken!, fixture!.classroomId);
    test.skip(!roomName, 'Seeded classroom did not come back from /api/classrooms');

    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Could not authenticate as teacher in this environment');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/tests/${testId}`, { waitUntil: 'domcontentloaded' });

    // The dialog's own open-effect fetches /api/classrooms AND
    // /api/question-bank/tests/library in one Promise.all before it decides
    // whether to pre-fill Classrooms with the teacher's active classroom, so
    // both responses have to land (not just one) before that pre-fill can have
    // committed -- waiting on only the faster of the two resolves too early.
    const [classroomsResponse, libraryResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/classrooms') && r.request().method() === 'GET'),
      page.waitForResponse(
        (r) => r.url().includes('/api/question-bank/tests/library') && r.request().method() === 'GET',
      ),
      page.getByRole('button', { name: 'Schedule as exam' }).click(),
    ]);
    await Promise.all([classroomsResponse.finished(), libraryResponse.finished()]);
    // The responses landing and React committing setSelectedClassrooms() are
    // different ticks, a short buffer for the second one.
    await page.waitForTimeout(500);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.MuiDialog-container')).toHaveCount(1);

    // getByRole('combobox', ...), not getByLabel: once the listbox is open, its
    // <ul> is also aria-labelledby the same "Classrooms" label, so getByLabel
    // matches both the input and the listbox and throws a strict-mode error.
    const classroomsInput = page.getByRole('combobox', { name: 'Classrooms' });
    const classroomsRoot = classroomsInput.locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " MuiAutocomplete-root ")]',
    );

    // Clear whatever classroom the pre-fill selected, without needing to know
    // its name (which classroom ends up first from /api/classrooms is not
    // guaranteed stable across runs). Backspace on a MUI multi Autocomplete
    // removes the last chip, repeated until none remain -- a no-op once
    // empty, so this is safe whether zero or one chip was pre-filled.
    await classroomsInput.click();
    for (let i = 0; i < 3; i++) {
      if ((await classroomsRoot.locator('.MuiChip-root').count()) === 0) break;
      await classroomsInput.press('Backspace');
    }
    await expect(classroomsRoot.locator('.MuiChip-root')).toHaveCount(0);

    await classroomsInput.fill(roomName!);
    await page.getByRole('option', { name: roomName!, exact: true }).click();

    // Cover one of the two seeded lectures.
    await page.getByRole('combobox', { name: 'What this covers' }).click();
    await page.getByRole('option', { name: /E2E Lecture 1/ }).click();
    await page.keyboard.press('Escape');

    const titleBefore = await page.getByLabel('What students will see this called').inputValue();

    await page.getByRole('button', { name: 'Preview who this is mandatory for' }).click();

    // Still exactly one dialog portal, this is the regression the original
    // bug would fail here: a second SwipeableDrawer portal would either add
    // a second container or bury the roster behind the still-open dialog.
    await expect(page.locator('.MuiDialog-container')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Who this is mandatory for' })).toBeVisible();
    await expect(page.getByText(/Mandatory \d+/)).toBeVisible();

    const backButton = page.getByRole('button', { name: 'Back to exam form' });
    await assertTouchTargetSize(page, '[aria-label="Back to exam form"]', 44);

    // A real click, not just a DOM presence check, this is what actually
    // proves the roster is not painted underneath the dialog: a click on an
    // occluded element fails Playwright's actionability check and times out.
    await backButton.click();

    await expect(page.getByRole('heading', { name: 'Schedule an exam' })).toBeVisible();
    await expect(page.getByLabel('What students will see this called')).toHaveValue(titleBefore);
    await expect(page.locator('.MuiDialog-container')).toHaveCount(1);

    await assertNoHorizontalOverflow(page);
  });
});

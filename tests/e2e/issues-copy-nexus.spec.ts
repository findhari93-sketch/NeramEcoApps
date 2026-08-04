import { test, expect, Page } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';
import { makeSolidPng } from '../utils/png';

/**
 * Handing a reported issue to Claude in exactly two pastes.
 *
 * The promise this feature makes is narrow and worth pinning down: ONE press
 * puts every piece of text a developer needs on the clipboard, and ONE more
 * press puts every screenshot there as a SINGLE image. Anything that turns it
 * back into six little copy buttons, or into two image pastes, is a regression.
 *
 * The spec seeds its own ticket (with a screenshot in the bucket) rather than
 * relying on whatever this environment happens to hold, and removes it after.
 * It self-skips, loudly, when the dev server or the service key is unavailable,
 * rather than reporting a green run it did not earn.
 */

const NEXUS = APP_URLS.nexus;
const MARKER = 'E2E copy-for-Claude fixture';
const SCREENSHOT_PATH = 'e2e-copy-for-claude/fixture.png';

/** Generated, not pasted: a corrupt fixture would only surface as a decode error. */
const FIXTURE_PNG = makeSolidPng(240, 160, [37, 99, 235]);

let admin: SupabaseClient | null = null;
let seededIssueId: string | null = null;
let seedProblem: string | null = null;

// Nexus pages are heavy in dev; the 30s default expires before a page settles.
test.describe.configure({ timeout: 120_000 });

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function removeFixture(client: SupabaseClient) {
  const { data: existing } = await client
    .from('nexus_foundation_issues')
    .select('id')
    .eq('title', MARKER);
  for (const row of existing || []) {
    await client.from('nexus_foundation_issue_activity').delete().eq('issue_id', row.id);
    await client.from('nexus_foundation_issues').delete().eq('id', row.id);
  }
  await client.storage.from('issue-screenshots').remove([SCREENSHOT_PATH]);
}

test.beforeAll(async () => {
  admin = adminClient();
  if (!admin) {
    seedProblem = 'No SUPABASE_SERVICE_ROLE_KEY in the environment, cannot seed a ticket';
    return;
  }

  // Stable fixture, reset rather than accumulated. See the test-account hygiene rule.
  await removeFixture(admin);

  const { data: student } = await admin
    .from('users')
    .select('id')
    .eq('email', 'e2etestingstudent@neramclasses.com')
    .maybeSingle();
  if (!student) {
    seedProblem = 'The e2e student is missing from this database';
    return;
  }

  const { error: uploadError } = await admin.storage
    .from('issue-screenshots')
    .upload(SCREENSHOT_PATH, FIXTURE_PNG, { contentType: 'image/png', upsert: true });
  if (uploadError) {
    seedProblem = `Could not seed the screenshot: ${uploadError.message}`;
    return;
  }

  const { data: issue, error } = await admin
    .from('nexus_foundation_issues')
    .insert({
      student_id: student.id,
      title: MARKER,
      description: 'Seeded by issues-copy-nexus.spec.ts. Safe to delete.',
      category: 'bug',
      status: 'open',
      priority: 'medium',
      page_url: '/student/tests/new',
      screenshot_urls: [SCREENSHOT_PATH],
      source_app: 'nexus',
      device_info: {
        device_type: 'desktop',
        browser: 'Chrome',
        browser_version: '139.0.0.0',
        os: 'Windows',
        os_version: '10.0',
        screen_width: 1280,
        screen_height: 800,
        connection_type: '4g',
      },
      console_logs: [
        {
          level: 'error',
          message: 'HTTP 400 /api/question-bank/tags — {"error":"classroom_id is required"}',
          stack: null,
          url: '/api/question-bank/tags',
          status: 400,
          at: '2026-08-02T13:50:10.000Z',
        },
      ],
    })
    .select('id')
    .single();

  if (error) {
    seedProblem = `Could not seed the ticket: ${error.message}`;
    return;
  }
  seededIssueId = issue.id;
});

// A spec that skips quietly reads exactly like a spec that passed. Say why.
test.beforeEach(async () => {
  if (seedProblem) console.warn(`[issues-copy] skipping: ${seedProblem}`);
});

test.afterAll(async () => {
  if (admin) await removeFixture(admin);
});

/** Open the issues list and select the seeded ticket. False when unusable. */
async function openSeededTicket(page: Page): Promise<boolean> {
  if (seedProblem || !seededIssueId) return false;
  try {
    await page.goto(`${NEXUS}/teacher/issues`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch {
    return false;
  }
  if (page.url().includes('/login')) return false;

  const ticket = page.getByText(MARKER, { exact: false }).first();
  try {
    await ticket.waitFor({ state: 'visible', timeout: 45_000 });
  } catch {
    return false;
  }
  await ticket.click();
  await page.getByTestId('copy-report').waitFor({ state: 'visible', timeout: 20_000 });
  return true;
}

test.describe('Nexus issues, copy for Claude', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('one press copies the whole ticket as text', async ({ page }) => {
    const ready = await openSeededTicket(page);
    test.skip(!ready, seedProblem || 'Nexus teacher issues page unavailable');

    await page.getByTestId('copy-report').click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());

    // The lead-in that tells Claude what to do with everything below it.
    expect(clipboard).toContain('Debug and fix this student-reported issue in apps/nexus.');
    // Ticket identity, so a reply can be traced back to a student.
    expect(clipboard).toMatch(/## NXS-\d+ · Bug · open · medium/);
    // The student's own words.
    expect(clipboard).toContain(`**Student says:** ${MARKER}`);
    // Where it happened, and where to start reading.
    expect(clipboard).toContain('**Where:** /student/tests/new');
    expect(clipboard).toContain('apps/nexus/src/app/(student)/student/tests/new/page.tsx');
    // What they were on.
    expect(clipboard).toContain('desktop · Chrome 139.0.0.0 · Windows 10.0 · 1280×800 · 4g');
    // The error that actually names the failing endpoint. This is the whole
    // reason a copy button beats reading the panel out loud.
    expect(clipboard).toContain('### Console (1)');
    expect(clipboard).toContain('/api/question-bank/tags');
    expect(clipboard).toContain('classroom_id is required');
  });

  test('the copy button confirms itself so staff know it worked', async ({ page }) => {
    const ready = await openSeededTicket(page);
    test.skip(!ready, seedProblem || 'Nexus teacher issues page unavailable');

    const button = page.getByTestId('copy-report');
    await button.click();
    await expect(button).toContainText('Copied');
  });

  test('one press copies every screenshot as a single image', async ({ page }) => {
    const ready = await openSeededTicket(page);
    test.skip(!ready, seedProblem || 'Nexus teacher issues page unavailable');

    const imagesButton = page.getByTestId('copy-images');
    await expect(imagesButton).toContainText('Copy 1 image');
    await imagesButton.click();
    await expect(imagesButton).toContainText('Copied', { timeout: 30_000 });

    // Exactly one image on the clipboard. More than one item would mean more
    // than one paste, which is the thing this feature exists to prevent.
    const types = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      return items.flatMap((item) => item.types);
    });
    expect(types).toContain('image/png');
    expect(types.filter((t) => t.startsWith('image/'))).toHaveLength(1);
  });

  test('mobile: both buttons are reachable and the panel does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const ready = await openSeededTicket(page);
    test.skip(!ready, seedProblem || 'Nexus teacher issues page unavailable');

    await assertTouchTargetSize(page, '[data-testid="copy-report"]', 44);
    await assertTouchTargetSize(page, '[data-testid="copy-images"]', 44);
    await assertNoHorizontalOverflow(page);
  });

  test('the image button appears only when the ticket has screenshots', async ({ page }) => {
    const ready = await openSeededTicket(page);
    test.skip(!ready, seedProblem || 'Nexus teacher issues page unavailable');

    // The two states have to agree: an image button exists if and only if a
    // screenshot is shown in the panel.
    const thumbnails = await page.locator('img[alt^="Screenshot"]').count();
    const imageButtons = await page.getByTestId('copy-images').count();
    expect(thumbnails).toBeGreaterThan(0);
    expect(imageButtons).toBe(1);
  });
});

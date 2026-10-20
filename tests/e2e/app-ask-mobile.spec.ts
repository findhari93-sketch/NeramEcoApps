/**
 * Tools App: Ask aiArchitek (/ask), as a signed-out visitor.
 *
 * The chat route is mocked with a canned event stream (the real one calls
 * Gemini), so these tests check the screen deterministically and spend
 * nothing. The route itself is covered by unit tests in apps/app/src/lib/ask
 * (tools, tiers, memory, quota, stream).
 *
 *   AC1: the welcome is server-rendered (heading, starter questions, why-us)
 *   AC2: an answer shows its text, the cutoff and college cards, follow-up
 *        chips, and the remembered details strip
 *   AC3: a card links to the tool page with the values filled in
 *   AC4: the 4th guest question shows the sign-in card, not an answer
 *   AC5: ?q= sends the question on arrival (links from the calculator, marketing)
 *   Mobile: no sideways scroll at 375px, touch targets of 44px or more
 *
 * Runs in app-chrome (desktop) and mobile-chrome (Pixel 5).
 * Run: pnpm test:e2e tests/e2e/app-ask-mobile.spec.ts --project=mobile-chrome --no-deps
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

const APP_URL = process.env.E2E_APP_URL || 'http://localhost:3011';

// A guest: never the saved student session.
test.use({ storageState: { cookies: [], origins: [] } });

const CUTOFF_CARD = {
  id: 'cutoff-1',
  kind: 'cutoff',
  href: '/tools/nata/cutoff-calculator?board=TN_STATE&max=600&marks=540',
  data: { total: 308, board200: 180, nata: 128, boardPercent: 90, boardEligible: true, boardLabel: 'Tamil Nadu State Board', marks: 540, boardMax: 600, nataExplanation: 'One attempt' },
};
const COLLEGES_CARD = {
  id: 'colleges-1',
  kind: 'colleges',
  href: '/tools/counseling/college-predictor?score=308&system=TNEA_BARCH&category=BC',
  data: {
    system: 'TNEA',
    year: 2025,
    basis: 'mark',
    studentValue: 308,
    category: 'BC',
    groups: {
      safe: [{ name: 'Test School of Architecture', city: 'Chennai', closing: 290.5, category: 'BC' }],
      target: [{ name: 'Sample Institute of Architecture', city: 'Madurai', closing: 305, category: 'OC' }],
      reach: [],
    },
    counts: { safe: 12, target: 1, reach: 0 },
    hidden: 11,
    source: 'TNEA B.Arch 2025 allotment list',
  },
};

function sse(events: unknown[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
}

async function mockAnswers(page: Page, opts: { allowed: number }) {
  let asked = 0;
  await page.route('**/api/ask/session**', (route: Route) =>
    route.fulfill({ json: { signedIn: false, facts: {}, guest: { remaining: opts.allowed, limit: 3 }, threads: [], messages: [] } })
  );
  await page.route('**/api/ask', async (route: Route) => {
    asked += 1;
    if (asked > opts.allowed) {
      return route.fulfill({ status: 403, json: { error: 'Sign in free to keep chatting.', code: 'SIGNUP_REQUIRED' } });
    }
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      body: sse([
        { t: 'meta', threadId: '00000000-0000-0000-0000-000000000001', guestRemaining: opts.allowed - asked },
        { t: 'status', text: 'Working out your cutoff...' },
        { t: 'card', card: CUTOFF_CARD },
        { t: 'card', card: COLLEGES_CARD },
        { t: 'delta', text: 'Your cutoff is **308** out of 400.\n\n- Based on last year’s allotment, 12 colleges are safe.' },
        { t: 'delta', text: '\n\n[[suggest: What is my rank? | Exam centres near me | Is it COA approved?]]' },
        { t: 'facts', facts: { board: 'TN_STATE', boardMax: 600, boardMarks: 540, nataScores: [128], cutoff: 308, community: 'BC' } },
        { t: 'done', suggestions: ['What is my rank?', 'Exam centres near me', 'Is it COA approved?'] },
      ]),
    });
  });
}

async function ask(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Your question' }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

test.describe('Ask aiArchitek (guest)', () => {
  test('AC1: the welcome is server-rendered for crawlers', async ({ request }) => {
    const res = await request.get(`${APP_URL}/ask`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('Ask about your NATA score, cutoff or colleges');
    expect(html).toContain('data-ask-starter');
    expect(html).toContain('Why ask here and not a general chatbot');
    expect(html).toContain('"@type":"FAQPage"');
  });

  test('AC2 + AC3: an answer shows text, cards, chips and remembered details', async ({ page }) => {
    await mockAnswers(page, { allowed: 3 });
    await page.goto(`${APP_URL}/ask`);
    await ask(page, 'TN board 540 out of 600, NATA 128, BC. Which colleges?');

    await expect(page.getByText('308', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your B.Arch cutoff' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'TNEA colleges for you' })).toBeVisible();
    await expect(page.getByText('Source: TNEA B.Arch 2025 allotment list')).toBeVisible();
    await expect(page.getByText('11 more colleges match. Sign in free to see them all.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'What is my rank?' })).toBeVisible();
    await expect(page.getByText('[[suggest')).toHaveCount(0);

    const strip = page.getByRole('region', { name: 'Details Ask aiArchitek remembers' });
    await expect(strip.getByText('Tamil Nadu State 540/600')).toBeVisible();
    await expect(strip.getByText('BC')).toBeVisible();

    const open = page.getByRole('link', { name: 'Open in Cutoff Calculator' });
    await expect(open).toHaveAttribute('href', CUTOFF_CARD.href);
    await expect(page.getByText('2 of 3 free answers left today. Sign in for unlimited.')).toBeVisible();
  });

  test('AC4: the question past the free answers shows the sign-in card', async ({ page }) => {
    await mockAnswers(page, { allowed: 0 });
    await page.goto(`${APP_URL}/ask`);
    await ask(page, 'Which KEAM colleges can I get?');
    await expect(page.getByRole('region', { name: 'Sign in to keep chatting' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in free and get my answer' })).toBeVisible();
    // The question is held for after sign-in, not shown unanswered.
    await expect(page.getByText('Which KEAM colleges can I get?')).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign in free and get my answer' }).click();
    await expect(page.getByRole('dialog', { name: 'Sign in to keep going' })).toBeVisible();
  });

  test('AC5: ?q= sends the question on arrival and tidies the address bar', async ({ page }) => {
    await mockAnswers(page, { allowed: 3 });
    await page.goto(`${APP_URL}/ask?q=${encodeURIComponent('My cutoff is 300, which colleges?')}&board=CBSE&marks=450`);
    await expect(page.getByText('My cutoff is 300, which colleges?')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your B.Arch cutoff' })).toBeVisible();
    await expect(page).toHaveURL(/\/ask$/);
  });

  test('mobile: no sideways scroll and thumb-sized targets', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAnswers(page, { allowed: 3 });
    await page.goto(`${APP_URL}/ask`);
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, '[data-ask-starter]', 44);
    await ask(page, 'TN board 540 out of 600, NATA 128');
    await expect(page.getByRole('region', { name: 'TNEA colleges for you' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'button[type="submit"][aria-label="Send"], button[aria-label="Stop the answer"]', 44);
    await assertTouchTargetSize(page, '[aria-label="Suggested questions"] button', 44);
  });
});

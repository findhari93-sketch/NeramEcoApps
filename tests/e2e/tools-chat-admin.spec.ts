import { test, expect, type Page } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin > Aintra Inbox > Tools app: what students ask Aintra in the Tools app.
 *
 *   AC1: the tab shows the totals, tool use and the conversation list
 *   AC2: filters narrow the list (asked to sign in, failed answers)
 *   AC3: opening a conversation shows questions, answers, cards and tools
 *   API: a malformed thread id is refused
 *
 * Data endpoints are mocked; UI tests skip when the runner has no Microsoft
 * session, as the other admin UI specs do.
 * Run: pnpm test:e2e --project="admin-chrome" --no-deps tests/e2e/tools-chat-admin.spec.ts
 */

const ADMIN = APP_URLS.admin;
const NOW = Date.now();
const ago = (m: number) => new Date(NOW - m * 60000).toISOString();

const VIEW = {
  stats: { threads: 2, questions: 4, answers: 2, signedInThreads: 1, guestThreads: 1, gatedQuestions: 1, failedAnswers: 1, medianMs: 3200 },
  threads: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      userId: 'u1',
      anonId: null,
      firstQuestion: 'When is NATA 2027?',
      lastQuestion: 'When is NATA 2027?',
      questions: 1,
      answers: 1,
      failed: 0,
      gated: 0,
      tools: ['exam_dates'],
      startedAt: ago(10),
      lastAt: ago(10),
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      userId: null,
      anonId: 'anon_0123456789abcdef0123456789abcdef',
      firstQuestion: 'CBSE 450, NATA 120. Which TNEA colleges?',
      lastQuestion: 'And KEAM?',
      questions: 3,
      answers: 1,
      failed: 1,
      gated: 1,
      tools: ['calculate_cutoff', 'predict_colleges'],
      startedAt: ago(90),
      lastAt: ago(80),
    },
  ],
  tools: [
    { name: 'calculate_cutoff', calls: 5, failed: 0 },
    { name: 'predict_colleges', calls: 3, failed: 1 },
  ],
  missing: [{ name: 'predict_colleges', count: 1 }],
  people: { u1: { name: 'Test Student', phone: '+91 90000 00000', email: null, enrolled: false } },
  truncated: false,
  generatedAt: new Date(NOW).toISOString(),
};

const MESSAGES = [
  { id: 'a', role: 'user', text: 'CBSE 450, NATA 120. Which TNEA colleges?', cards: [], tool_calls: null, error: null, response_ms: null, created_at: ago(90) },
  {
    id: 'b',
    role: 'assistant',
    text: 'Your cutoff is **300** out of 400.',
    cards: [{ kind: 'cutoff', data: { total: 300, board200: 180, nata: 120 } }],
    tool_calls: [
      { name: 'calculate_cutoff', ok: true },
      { name: 'predict_colleges', ok: false },
    ],
    error: null,
    response_ms: 4100,
    created_at: ago(89),
  },
  { id: 'c', role: 'user', text: 'And KEAM?', cards: [], tool_calls: null, error: 'SIGNUP_REQUIRED', response_ms: null, created_at: ago(80) },
];

async function mock(page: Page) {
  await page.route('**/api/aintra-inbox', (r) =>
    r.fulfill({ json: { conversations: [], people: [], generatedAt: new Date(NOW).toISOString(), truncated: false } })
  );
  await page.route('**/api/ai-health', (r) => r.fulfill({ json: { blocked: false, since: null, failedCalls: 0 } }));
  await page.route('**/api/aintra-inbox/tools-chat?**', (r) => {
    const url = new URL(r.request().url());
    if (url.searchParams.get('thread')) return r.fulfill({ json: { messages: MESSAGES } });
    return r.fulfill({ json: VIEW });
  });
}

async function open(page: Page) {
  await page.goto(`${ADMIN}/aintra-inbox?tab=tools-chat`, { waitUntil: 'domcontentloaded' });
  const rendered = await page
    .getByRole('heading', { name: 'Aintra Inbox' })
    .waitFor({ timeout: 20_000 })
    .then(() => true, () => false);
  test.skip(!rendered || /\/login|microsoftonline/.test(page.url()), 'No Microsoft session on this runner');
}

test.describe('Aintra Inbox: Tools chat @admin', () => {
  test('API: a malformed thread id is refused', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/aintra-inbox/tools-chat?thread=not-a-uuid`, { failOnStatusCode: false });
    expect([400, 401, 403]).toContain(res.status());
  });

  test('AC1: totals, tool use and the conversation list', async ({ page }) => {
    await mock(page);
    await open(page);
    await expect(page.getByRole('tab', { name: 'Tools app' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Asked to sign in').first()).toBeVisible();
    await expect(page.getByText('Typical answer time')).toBeVisible();
    await expect(page.getByText('3.2s')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tools it used' })).toBeVisible();
    await expect(page.getByText('When is NATA 2027?')).toBeVisible();
    await expect(page.getByText('CBSE 450, NATA 120. Which TNEA colleges?')).toBeVisible();
  });

  test('AC2: filters narrow the list', async ({ page }) => {
    await mock(page);
    await open(page);
    await page.getByRole('button', { name: 'Failed answers' }).click();
    await expect(page.getByText('When is NATA 2027?')).toHaveCount(0);
    await expect(page.getByText('CBSE 450, NATA 120. Which TNEA colleges?')).toBeVisible();
    await page.getByRole('button', { name: 'Signed in' }).click();
    await expect(page.getByText('When is NATA 2027?')).toBeVisible();
  });

  test('AC3: a conversation shows answers, cards, tools and the sign-in gate', async ({ page }) => {
    await mock(page);
    await open(page);
    await page.getByText('CBSE 450, NATA 120. Which TNEA colleges?').click();
    await expect(page.getByText('Cutoff 300/400 (board 180 + NATA 120)')).toBeVisible();
    await expect(page.getByText('Colleges: no answer')).toBeVisible();
    await expect(page.getByText('Asked to sign in (not answered)')).toBeVisible();
  });
});

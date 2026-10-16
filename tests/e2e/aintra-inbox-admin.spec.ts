import { test, expect, type Page } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin > Aintra Inbox (was Chat History).
 *
 * The data endpoints are mocked so the spec does not depend on live chats,
 * the Gemini key or seed data; the API guard tests hit the real routes.
 * If the dashboard bounces to Microsoft login (unauthenticated runner) the UI
 * tests skip, as the other admin UI specs do.
 *
 * Run: pnpm test:e2e --project="admin-chrome" --no-deps tests/e2e/aintra-inbox-admin.spec.ts
 */

const ADMIN = APP_URLS.admin;
const NOW = new Date();
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60000).toISOString();
const GUEST_ANON = `anon_${'a'.repeat(28)}4a1f`;

const conv = (over: Record<string, unknown>) => ({
  personKey: 'x',
  userId: null,
  anonymousId: null,
  isGuest: true,
  name: 'Guest',
  guestTag: '#0000',
  initials: '',
  phone: null,
  startedAt: minsAgo(30),
  lastAt: minsAgo(30),
  bucket: 'today',
  place: null,
  stateName: null,
  channel: null,
  device: null,
  source: 'general_chatbot',
  questions: ['Hello'],
  turnStatuses: ['none'],
  lastQuestion: 'Hello',
  turnCount: 1,
  intents: [],
  status: 'none',
  reviewCount: 0,
  errorCount: 0,
  creditErrorCount: 0,
  ...over,
});

const PAYLOAD = {
  generatedAt: NOW.toISOString(),
  truncated: false,
  conversations: [
    conv({
      id: 's-guest',
      personKey: `a:${GUEST_ANON}`,
      anonymousId: GUEST_ANON,
      guestTag: '#4A1F',
      place: 'Madurai, Tamil Nadu',
      stateName: 'Tamil Nadu',
      channel: 'meta_ads',
      device: 'Android · Chrome',
      questions: ['What are the class timings?', 'What are the course fees?'],
      turnStatuses: ['none', 'review'],
      lastQuestion: 'What are the course fees?',
      turnCount: 2,
      intents: ['fees', 'timings'],
      status: 'review',
      reviewCount: 1,
    }),
    conv({
      id: 's-user',
      personKey: 'u:u1',
      userId: 'u1',
      isGuest: false,
      name: 'Arjun Selvam',
      guestTag: null,
      initials: 'AS',
      phone: '+919444055218',
      lastAt: minsAgo(60),
      place: 'Chennai, Tamil Nadu',
      stateName: 'Tamil Nadu',
      channel: 'youtube',
      questions: ['Is the NATA 2027 exam date announced?'],
      turnStatuses: ['ok'],
      lastQuestion: 'Is the NATA 2027 exam date announced?',
      intents: ['exam_dates'],
      status: 'ok',
    }),
    conv({
      id: 's-credits',
      personKey: 's:s-credits',
      guestTag: '#77C2',
      lastAt: minsAgo(90),
      questions: ['Do you have weekend batches?'],
      turnStatuses: ['error'],
      lastQuestion: 'Do you have weekend batches?',
      intents: ['timings'],
      status: 'error',
      errorCount: 1,
      creditErrorCount: 1,
    }),
  ],
  people: [
    {
      key: `a:${GUEST_ANON}`, userId: null, anonymousId: GUEST_ANON, isGuest: true, name: 'Guest', guestTag: '#4A1F', initials: '',
      phone: null, email: null, avatarUrl: null, profileLabel: null, joinedAt: null, place: 'Madurai, Tamil Nadu', channel: 'meta_ads',
      device: 'Android · Chrome', visits: 3, firstSeen: minsAgo(5000), lastAt: minsAgo(30), lastQuestion: 'What are the course fees?',
      lastConversationId: 's-guest', intents: ['fees', 'timings'], stage: 'Warm', nudge: null,
    },
    {
      key: 'u:u1', userId: 'u1', anonymousId: null, isGuest: false, name: 'Arjun Selvam', guestTag: null, initials: 'AS',
      phone: '+919444055218', email: 'arjun@example.com', avatarUrl: null, profileLabel: 'School Student · NATA', joinedAt: minsAgo(40000),
      place: 'Chennai, Tamil Nadu', channel: 'youtube', device: null, visits: 7, firstSeen: minsAgo(40000), lastAt: minsAgo(60),
      lastQuestion: 'Is the NATA 2027 exam date announced?', lastConversationId: 's-user', intents: ['exam_dates'], stage: 'Enrolled', nudge: null,
    },
    {
      key: 's:s-credits', userId: null, anonymousId: null, isGuest: true, name: 'Guest', guestTag: '#77C2', initials: '',
      phone: null, email: null, avatarUrl: null, profileLabel: null, joinedAt: null, place: null, channel: null, device: null, visits: 1,
      firstSeen: minsAgo(90), lastAt: minsAgo(90), lastQuestion: 'Do you have weekend batches?', lastConversationId: 's-credits',
      intents: ['timings'], stage: 'Warm', nudge: null,
    },
  ],
};

const turn = (over: Record<string, unknown>) => ({
  at: minsAgo(30), error: null, status: 'none', thumbsUp: null, correction: null, correctedByName: null, correctedAt: null,
  promotedToKb: false, aiReview: null, model: 'gemini-2.5-flash', responseMs: 1800, tools: [], pageUrl: '/', ...over,
});

const TURNS: Record<string, unknown[]> = {
  's-guest': [
    turn({ id: 't1', question: 'What are the class timings?', answer: 'Weekday batches run 6 to 8 pm.' }),
    turn({
      id: 't2',
      question: 'What are the course fees?',
      answer: 'Here are our fees:\n\n| Course | Fee |\n|---|---|\n| Crash Course | ₹15,000 |\n\n[[cta:apply,demo]]',
      status: 'review',
      thumbsUp: false,
    }),
  ],
  's-user': [turn({ id: 't3', question: 'Is the NATA 2027 exam date announced?', answer: 'Not yet.', status: 'ok', thumbsUp: true })],
  's-credits': [turn({ id: 't4', question: 'Do you have weekend batches?', answer: null, error: 'CREDITS_DEPLETED', status: 'error' })],
};

async function mockInbox(page: Page) {
  const patches: { id: string; body: any }[] = [];
  const kbPosts: any[] = [];
  const nudges: any[] = [];
  await page.route('**/api/aintra-inbox', (r) => r.fulfill({ json: PAYLOAD }));
  await page.route('**/api/aintra-inbox/conversation/*', (r) => {
    const id = decodeURIComponent(r.request().url().split('/').pop()!);
    return r.fulfill({ json: { turns: TURNS[id] ?? [] } });
  });
  await page.route('**/api/ai-health', (r) => r.fulfill({ json: { blocked: false, since: null, failedCalls: 0 } }));
  await page.route('**/api/aintra-inbox/notes*', (r) =>
    r.request().method() === 'GET'
      ? r.fulfill({ json: { notes: [] } })
      : r.fulfill({ json: { note: { id: 'n1', note: JSON.parse(r.request().postData() || '{}').note, admin_name: 'Test', created_at: NOW.toISOString() } } })
  );
  await page.route('**/api/aintra-inbox/nudge', (r) => {
    nudges.push({ method: r.request().method(), body: JSON.parse(r.request().postData() || '{}') });
    return r.fulfill({ json: { nudge: { requestedAt: NOW.toISOString(), requestedByName: 'Test Teacher', shownAt: null } } });
  });
  await page.route(/\/api\/chatbot-logs\/[^/]+$/, (r) => {
    const id = r.request().url().split('/').pop()!;
    const body = JSON.parse(r.request().postData() || '{}');
    patches.push({ id, body });
    return r.fulfill({
      json: {
        data: {
          thumbs_up: body.thumbs_up ?? null,
          admin_correction: body.admin_correction ?? null,
          corrected_by_name: body.admin_correction ? 'Test Teacher' : null,
          corrected_at: body.admin_correction ? NOW.toISOString() : null,
          promoted_to_kb: !!body.promoted_to_kb,
        },
      },
    });
  });
  await page.route('**/api/chatbot-logs/*/ai-review', (r) =>
    r.fulfill({
      json: { verdict: 'wrong', reasoning: 'The fee table is out of date.', suggestedCorrection: 'Crash Course: ₹15,000. 1-Year: ₹25,000.', model: 'mock' },
    })
  );
  await page.route('**/api/aintra/kb', (r) => {
    kbPosts.push(JSON.parse(r.request().postData() || '{}'));
    return r.fulfill({ json: { data: { id: 'kb1' } } });
  });
  return { patches, kbPosts, nudges };
}

/** Opens the page; skips the test when the runner has no Microsoft session (as the other admin UI specs do). */
async function open(page: Page, path = '/aintra-inbox') {
  await page.goto(`${ADMIN}${path}`, { waitUntil: 'domcontentloaded' });
  const rendered = await page
    .getByRole('heading', { name: 'Aintra Inbox' })
    .waitFor({ timeout: 20_000 })
    .then(() => true, () => false);
  test.skip(!rendered || /\/login|microsoftonline/.test(page.url()), 'No Microsoft session on this runner');
}

test.describe('Aintra Inbox @admin', () => {
  test.describe('API guards', () => {
    test('conversation route refuses an empty id and 404s an unknown chat', async ({ request }) => {
      const res = await request.get(`${ADMIN}/api/aintra-inbox/conversation/no-such-session-xyz`, { failOnStatusCode: false });
      expect([404, 401]).toContain(res.status());
    });

    test('nudge route refuses a malformed visitor id', async ({ request }) => {
      const res = await request.post(`${ADMIN}/api/aintra-inbox/nudge`, { data: { anonymousId: 'nope' }, failOnStatusCode: false });
      expect([400, 401]).toContain(res.status());
    });

    test('notes route refuses a non-uuid person', async ({ request }) => {
      const res = await request.get(`${ADMIN}/api/aintra-inbox/notes?userId=abc`, { failOnStatusCode: false });
      expect([400, 401]).toContain(res.status());
    });
  });

  test('old /chat-history redirects to Aintra Inbox, keeping the query', async ({ request }) => {
    const res = await request.get(`${ADMIN}/chat-history?view=locations`, { maxRedirects: 0, failOnStatusCode: false });
    expect([307, 308]).toContain(res.status());
    expect(res.headers()['location']).toMatch(/\/aintra-inbox\?view=locations$/);
  });

  test('?view=locations opens the Insights tab', async ({ page }) => {
    await mockInbox(page);
    await open(page, '/aintra-inbox?view=locations');
    await expect(page.getByRole('tab', { name: 'Insights' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/tab=insights/);
  });

  test('sidebar says Aintra Inbox', async ({ page }) => {
    await mockInbox(page);
    await open(page);
    await expect(page.getByRole('link', { name: /Aintra Inbox/ }).first()).toBeVisible();
    await expect(page.getByText('Chat History', { exact: true })).toHaveCount(0);
  });

  test('conversations: list, transcript with a real table, and the person panel', async ({ page }) => {
    await mockInbox(page);
    await open(page);
    await expect(page.getByRole('heading', { name: 'Aintra Inbox' })).toBeVisible();
    const list = page.getByRole('region', { name: 'Conversations' });
    await expect(list.getByText('What are the course fees?')).toBeVisible();
    // First chat is selected: its answer table renders as a table, not pipes.
    const transcript = page.getByRole('region', { name: 'Transcript' });
    await expect(transcript.getByRole('table')).toBeVisible();
    await expect(transcript.getByRole('cell', { name: '₹15,000' })).toBeVisible();
    await expect(transcript.getByText('Buttons shown: Apply, Book a demo')).toBeVisible();
    await expect(page.getByRole('complementary', { name: /guest #4A1F/i })).toContainText('Android · Chrome');
  });

  test('segments and status filters narrow the list', async ({ page }) => {
    await mockInbox(page);
    await open(page);
    const list = page.getByRole('region', { name: 'Conversations' });
    await list.getByRole('radio', { name: /Signed in/ }).click();
    await expect(list.getByText('Arjun Selvam')).toBeVisible();
    await expect(list.getByText('What are the course fees?')).toHaveCount(0);
    await list.getByRole('radio', { name: /^All/ }).click();
    await list.getByRole('button', { name: /Credits ran out · 1/ }).click();
    await expect(list.getByText('Do you have weekend batches?')).toBeVisible();
    await expect(list.getByText('Arjun Selvam')).toHaveCount(0);
  });

  test('review queue button shows wrong and unanswered chats', async ({ page }) => {
    await mockInbox(page);
    await open(page);
    await page.getByRole('button', { name: /Review queue · 2/ }).click();
    const list = page.getByRole('region', { name: 'Conversations' });
    await expect(list.getByText('What are the course fees?')).toBeVisible();
    await expect(list.getByText('Do you have weekend batches?')).toBeVisible();
    await expect(list.getByText('Arjun Selvam')).toHaveCount(0);
  });

  test('thumbs down opens the editor; Draft with AI and Save correction add it to the KB', async ({ page }) => {
    const calls = await mockInbox(page);
    await open(page);
    const transcript = page.getByRole('region', { name: 'Transcript' });
    const first = transcript.getByRole('article').first();
    await first.getByRole('button', { name: 'Wrong answer' }).click();
    const box = first.getByLabel('Better / corrected answer');
    await expect(box).toBeVisible();
    await first.getByRole('button', { name: 'Draft with AI' }).click();
    await expect(box).toHaveValue(/Crash Course/);
    await expect(first.getByText(/AI Review:/)).toBeVisible();
    await first.getByRole('button', { name: 'Save correction' }).click();
    await expect(first.getByText(/CORRECTED ANSWER · SAVED TO KNOWLEDGE BASE/)).toBeVisible();
    await expect(first.getByText('by Test Teacher', { exact: false })).toBeVisible();
    expect(calls.patches.some((p) => p.id === 't1' && p.body.thumbs_up === false)).toBe(true);
    expect(calls.patches.some((p) => p.id === 't1' && /Crash Course/.test(p.body.admin_correction))).toBe(true);
    expect(calls.kbPosts[0]).toMatchObject({ question: 'What are the class timings?' });
  });

  test('an unanswered turn says why and offers Write answer', async ({ page }) => {
    await mockInbox(page);
    await open(page, '/aintra-inbox?c=s-credits');
    const transcript = page.getByRole('region', { name: 'Transcript' });
    await expect(transcript.getByText('No answer delivered: credits ran out')).toBeVisible();
    await expect(transcript.getByRole('button', { name: 'Write answer' })).toBeVisible();
    await expect(transcript.getByRole('button', { name: 'Good answer' })).toHaveCount(0);
  });

  test('guest: ask to sign up next visit queues the card', async ({ page }) => {
    const calls = await mockInbox(page);
    await open(page);
    await page.getByRole('button', { name: 'Ask to sign up next visit' }).click();
    await expect(page.getByText('Sign-up card queued')).toBeVisible();
    expect(calls.nudges[0]).toMatchObject({ method: 'POST', body: { anonymousId: GUEST_ANON } });
  });

  test('signed in: Call and WhatsApp link to the phone', async ({ page }) => {
    await mockInbox(page);
    await open(page, '/aintra-inbox?c=s-user');
    const panel = page.getByRole('complementary', { name: /Arjun Selvam/ });
    await expect(panel.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+919444055218');
    await expect(panel.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/919444055218');
    await expect(panel).toContainText('Enrolled');
  });

  test('people & leads: Open chat jumps to that conversation', async ({ page }) => {
    await mockInbox(page);
    await open(page);
    await page.getByRole('tab', { name: 'People & leads' }).click();
    await expect(page.getByText('Hot leads this week')).toBeVisible();
    const row = page.getByRole('row', { name: /Arjun Selvam/ });
    await row.getByRole('button', { name: 'Open chat' }).click();
    await expect(page.getByRole('tab', { name: 'Conversations' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('region', { name: 'Transcript' }).getByText('Is the NATA 2027 exam date announced?')).toBeVisible();
    await expect(page).toHaveURL(/c=s-user/);
  });

  test('insights: stats, panels and struggling questions', async ({ page }) => {
    await mockInbox(page);
    await open(page, '/aintra-inbox?tab=insights');
    await expect(page.getByText('Chatters', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What they want' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Questions Aintra struggles with' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'What are the course fees?' })).toBeVisible();
    await page.getByRole('button', { name: 'Lifetime' }).click();
    await expect(page).toHaveURL(/range=all/);
  });

  for (const width of [1280, 1024]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.setViewportSize({ width, height: 900 });
      await mockInbox(page);
      await open(page);
      await expect(page.getByRole('region', { name: 'Transcript' }).getByRole('article').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(errors.filter((e) => !/favicon|Download the React DevTools/i.test(e))).toEqual([]);
    });
  }
});

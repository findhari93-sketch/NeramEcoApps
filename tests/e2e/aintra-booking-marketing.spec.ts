import { test, expect, type Page, type Route } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Booking inside the Aintra chat (2026-10-19): Aintra places a callback or
 * demo card with [[book:callback]] / [[book:demo]], the visitor confirms it in
 * place, and the card posts to the site's own routes.
 *
 * /api/chat answers from a fixture, and /api/callback and the demo settings are
 * mocked too, so no real callback or demo row is ever created by this suite.
 *
 * Run: pnpm test:e2e tests/e2e/aintra-booking-marketing.spec.ts --project=marketing-chrome
 */

function ndjson(answer: string, chunk = 24): string {
  const lines: string[] = [];
  for (let i = 0; i < answer.length; i += chunk) lines.push(JSON.stringify({ t: 'delta', text: answer.slice(i, i + chunk) }));
  lines.push(JSON.stringify({ t: 'done', model: 'fixture', finishReason: 'STOP' }));
  return `${lines.join('\n')}\n`;
}

async function mockChat(page: Page, answer: string) {
  await page.route('**/api/chat', (route: Route) =>
    route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }, body: ndjson(answer) }),
  );
}

/** Captures what the card posts; answers with `status`. */
async function mockCallback(page: Page, status = 201) {
  const posted: Record<string, unknown>[] = [];
  await page.route('**/api/callback', async (route: Route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posted.push(route.request().postDataJSON());
    const body =
      status === 201
        ? { success: true, data: { id: 'fixture' } }
        : { success: false, code: 'ALREADY_ASKED', error: 'We already have your callback request from today.' };
    await route.fulfill({ status, json: body });
  });
  return posted;
}

async function openAintra(page: Page) {
  await page.goto('/');
  const opener = page.getByTestId('aintra-opener');
  await expect(opener).toBeVisible({ timeout: 45000 });
  await opener.click();
  await expect(page.getByTestId('aintra-input')).toBeVisible({ timeout: 5000 });
}

async function ask(page: Page, text: string) {
  const input = page.getByTestId('aintra-input');
  await input.fill(text);
  await input.press('Enter');
  const last = page.getByTestId('aintra-assistant-message').last();
  await expect(last).toHaveAttribute('data-streaming', 'false', { timeout: 35000 });
  return last;
}

const CALLBACK_ANSWER = 'Sure, our counsellor will call you. Pick a time below.\n\n[[book:callback,tomorrow,evening]]';
const DEMO_ANSWER = 'You can book a free online demo class here.\n\n[[book:demo,anytime]]\n\n[[cta:demo,whatsapp]]';
// What the chat route attaches after the prepare_demo_booking tool (2026-10-20).
const PREPARED_DEMO_CARD = '[[book:demo,anytime,name=Priya%20K,year=2027,parent=yes]]';
const PREPARED_DEMO_ANSWER = `I have set up Priya's free demo. Sign in and tap Confirm below.\n\n${PREPARED_DEMO_CARD}`;

test.describe('Aintra booking cards @marketing', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.sessionStorage.removeItem('aintra_dismissed');
      } catch {}
    });
  });

  test.describe('mobile 375', () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

    test('AC1: a guest books a callback in the chat; the card posts the chosen day and time', async ({ page }) => {
      await mockChat(page, CALLBACK_ANSWER);
      const posted = await mockCallback(page);
      await openAintra(page);
      const answer = await ask(page, 'Can someone call me tomorrow evening?');

      const card = answer.getByRole('region', { name: 'Request a callback' });
      await expect(card).toBeVisible();
      await expect(card.getByRole('button', { name: 'Tomorrow', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(card.getByRole('button', { name: /^Evening/ })).toHaveAttribute('aria-pressed', 'true');
      expect((await answer.textContent()) ?? '').not.toContain('[[');

      await card.getByLabel('Your name').fill('Priya');
      await card.getByLabel('Mobile number').fill('98765 43210');
      await card.screenshot({ path: 'test-results/aintra-callback-card-375.png' });
      await card.getByRole('button', { name: 'Call me tomorrow evening' }).click();

      await expect(answer.getByRole('region', { name: 'Callback booked' }).getByRole('status')).toContainText('We will call you tomorrow evening on +91 98xxx xx210');
      expect(posted).toHaveLength(1);
      expect(posted[0]).toMatchObject({
        name: 'Priya',
        phone: '9876543210',
        preferred_slot: 'evening',
        query_type: 'aintra_chat',
        source: 'aintra',
      });
      expect(String(posted[0].preferred_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(posted[0].notes)).toMatch(/^Aintra chat: chat_/);
    });

    test('AC2: a wrong number is caught in the card and nothing is sent', async ({ page }) => {
      await mockChat(page, CALLBACK_ANSWER);
      const posted = await mockCallback(page);
      await openAintra(page);
      const answer = await ask(page, 'Call me please');
      const card = answer.getByRole('region', { name: 'Request a callback' });
      await card.getByLabel('Your name').fill('Priya');
      await card.getByLabel('Mobile number').fill('12345');
      await card.getByRole('button', { name: /^Call me/ }).click();
      await expect(card).toContainText('Enter a 10-digit Indian mobile number');
      expect(posted).toHaveLength(0);
    });

    test('AC3: a second ask the same day says the callback is already booked', async ({ page }) => {
      await mockChat(page, CALLBACK_ANSWER);
      await mockCallback(page, 429);
      await openAintra(page);
      const answer = await ask(page, 'Call me again');
      const card = answer.getByRole('region', { name: 'Request a callback' });
      await card.getByLabel('Your name').fill('Priya');
      await card.getByLabel('Mobile number').fill('9876543210');
      await card.getByRole('button', { name: /^Call me/ }).click();
      await expect(answer.getByRole('region', { name: 'Your callback is already booked' })).toBeVisible();
    });

    test('AC4: a guest sees the demo card with Sign in to book, which opens the chat sign-in', async ({ page }) => {
      await mockChat(page, DEMO_ANSWER);
      await openAintra(page);
      const answer = await ask(page, 'I want to attend a demo class');
      const card = answer.getByRole('region', { name: 'Book a free demo class' });
      await expect(card).toBeVisible({ timeout: 15000 });
      await expect(card.getByRole('button', { name: 'Any time works, just call me' })).toHaveAttribute('aria-pressed', 'true');
      // The card is the demo button: the [[cta:demo]] next to it is dropped.
      await expect(answer.getByRole('link', { name: 'Book a demo class' })).toHaveCount(0);
      await card.screenshot({ path: 'test-results/aintra-demo-card-375.png' });
      await card.getByRole('button', { name: 'Sign in to book' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
    });

    test('AC5: a demo Aintra set up opens as a summary to confirm, and Change details opens the picker', async ({ page }) => {
      await mockChat(page, PREPARED_DEMO_ANSWER);
      await openAintra(page);
      const answer = await ask(page, 'Book a demo for Priya, NATA 2027, any time, her mother will join');
      const card = answer.getByRole('region', { name: 'Check and confirm your free demo' });
      await expect(card).toBeVisible({ timeout: 15000 });
      await expect(card).toContainText('Priya K');
      await expect(card).toContainText('2027');
      await expect(card).toContainText('Parent joining');
      expect((await answer.textContent()) ?? '').not.toContain('[[');
      await card.screenshot({ path: 'test-results/aintra-demo-confirm-375.png' });
      await expect(card.getByRole('button', { name: 'Sign in to confirm' })).toBeVisible();
      await assertTouchTargetSize(page, '[aria-labelledby^="aintra-demo-title"] button');

      await card.getByRole('button', { name: 'Change details' }).click();
      const editing = answer.getByRole('region', { name: 'Book a free demo class' });
      await expect(editing.getByRole('button', { name: 'Any time works, just call me' })).toHaveAttribute('aria-pressed', 'true');
      await expect(editing.getByRole('button', { name: 'Sign in to book' })).toBeVisible();
    });

    test('AC6: the prepared card wins over a plain one the model wrote: one demo card only', async ({ page }) => {
      await mockChat(page, `Sure.\n\n[[book:demo]]\n\nTap Confirm below.\n\n${PREPARED_DEMO_CARD}`);
      await openAintra(page);
      const answer = await ask(page, 'Book my demo');
      await expect(answer.getByRole('region', { name: 'Check and confirm your free demo' })).toBeVisible({ timeout: 15000 });
      await expect(answer.getByRole('region', { name: 'Book a free demo class' })).toHaveCount(0);
    });

    test('AC7: a callback Aintra set up carries the topic into the request', async ({ page }) => {
      await mockChat(page, 'Our counsellor will call you tomorrow evening.\n\n[[book:callback,tomorrow,evening,topic=Fees%20for%20the%201-year%20course]]');
      const posted = await mockCallback(page);
      await openAintra(page);
      const answer = await ask(page, 'Call me tomorrow evening about the 1-year fees');
      const card = answer.getByRole('region', { name: 'Request a callback' });
      await expect(card.getByLabel('What should we help with? (optional)')).toHaveValue('Fees for the 1-year course');
      await card.getByLabel('Your name').fill('Priya');
      await card.getByLabel('Mobile number').fill('9876543210');
      await card.getByRole('button', { name: 'Call me tomorrow evening' }).click();
      await expect(answer.getByRole('region', { name: 'Callback booked' })).toBeVisible();
      expect(String(posted[0].notes)).toContain('Fees for the 1-year course');
    });

    test('AC8: a guest asking to cancel is asked to sign in first, nothing is cancelled', async ({ page }) => {
      const patched: unknown[] = [];
      await page.route('**/api/demo-class/mine', (route) => {
        if (route.request().method() === 'PATCH') patched.push(route.request().postDataJSON());
        return route.fulfill({ status: 401, json: { error: 'SIGN_IN_REQUIRED' } });
      });
      await mockChat(page, 'I can cancel it for you once you sign in.\n\n[[book:cancel-demo,reason=exam%20clash]]');
      await openAintra(page);
      const answer = await ask(page, 'Cancel my demo, I have an exam');
      const card = answer.getByRole('region', { name: 'Sign in to manage your demo' });
      await expect(card).toBeVisible({ timeout: 15000 });
      await card.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
      expect(patched).toHaveLength(0);
    });

    // Phase 2 (2026-10-20): the application and the short public forms.
    test('AC9: a guest asking to apply gets the sign-in card for the application', async ({ page }) => {
      await mockChat(page, 'Happy to fill it in with you. Sign in first.\n\n[[book:apply]]\n\n[[cta:apply]]');
      await openAintra(page);
      const answer = await ask(page, 'Help me complete my application');
      const card = answer.getByRole('region', { name: 'Sign in to start your application' });
      await expect(card).toBeVisible({ timeout: 15000 });
      // The card is the apply button: the [[cta:apply]] beside it is dropped.
      await expect(answer.getByRole('link', { name: /^Apply/ })).toHaveCount(0);
      await card.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
    });

    test('AC10: a centre visit Aintra set up posts the centre, day and slot', async ({ page }) => {
      const posted: Record<string, unknown>[] = [];
      await page.route('**/api/centers/visit', async (route) => {
        posted.push(route.request().postDataJSON());
        await route.fulfill({ status: 201, json: { success: true, data: { id: 'fixture' } } });
      });
      const tomorrow = new Date(Date.now() + 5.5 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
      await mockChat(
        page,
        `Here is your visit to Tambaram.\n\n[[book:visit,${tomorrow},f.centreId=c-tambaram,f.centreName=Tambaram%2C%20Chennai,f.slot=2%3A00%20PM%20-%205%3A00%20PM,f.slots=10%3A00%20AM%20-%2012%3A00%20PM%7C2%3A00%20PM%20-%205%3A00%20PM,f.purpose=See%20the%20studio]]`,
      );
      await openAintra(page);
      const answer = await ask(page, 'I want to visit the Tambaram centre tomorrow afternoon');
      const card = answer.getByRole('region', { name: 'Book a centre visit' });
      await expect(card).toContainText('Tambaram, Chennai');
      await expect(card.getByRole('button', { name: 'Tomorrow', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(card.getByRole('button', { name: '2:00 PM - 5:00 PM' })).toHaveAttribute('aria-pressed', 'true');
      await card.screenshot({ path: 'test-results/aintra-visit-card-375.png' });
      await card.getByLabel('Your name').fill('Priya');
      await card.getByLabel('Mobile number').fill('9876543210');
      await card.getByRole('button', { name: 'Book my visit' }).click();
      await expect(answer.getByRole('region', { name: 'Visit booked' })).toBeVisible();
      expect(posted[0]).toMatchObject({
        center_id: 'c-tambaram',
        visitor_name: 'Priya',
        visitor_phone: '9876543210',
        visit_date: tomorrow,
        visit_time_slot: '2:00 PM - 5:00 PM',
        purpose: 'See the studio',
      });
    });

    test('AC11: a college enquiry cannot be sent without the consent tick', async ({ page }) => {
      const posted: Record<string, unknown>[] = [];
      await page.route('**/api/colleges/leads', async (route) => {
        posted.push(route.request().postDataJSON());
        await route.fulfill({ status: 200, json: { success: true, id: 'fixture', delivered: true } });
      });
      await mockChat(page, 'I can send your question to them.\n\n[[book:college-enquiry,f.collegeId=col-1,f.collegeName=Papni%20School%20of%20Architecture,f.message=Is%20there%20a%20hostel%3F]]');
      await openAintra(page);
      const answer = await ask(page, 'Ask Papni about hostel');
      const card = answer.getByRole('region', { name: 'Ask Papni School of Architecture about admission' });
      await expect(card.getByLabel('Your question to the college (optional)')).toHaveValue('Is there a hostel?');
      await card.getByLabel('Your name').fill('Priya');
      await card.getByLabel('Mobile number').fill('9876543210');
      const send = card.getByRole('button', { name: 'Send my enquiry' });
      await expect(send).toBeDisabled();
      await card.getByRole('checkbox').check();
      await send.click();
      await expect(answer.getByRole('region', { name: 'Sent' })).toBeVisible();
      expect(posted[0]).toMatchObject({ college_id: 'col-1', name: 'Priya', phone: '9876543210', consent_given: true, message: 'Is there a hostel?' });
    });

    test('AC12: a message to the team needs an email, then posts to the contact route', async ({ page }) => {
      const posted: Record<string, unknown>[] = [];
      await page.route('**/api/contact', async (route) => {
        posted.push(route.request().postDataJSON());
        await route.fulfill({ status: 201, json: { success: true } });
      });
      await mockChat(page, 'I have written it up for our team.\n\n[[book:message,f.subject=Hostel%20near%20Chennai,f.message=Do%20you%20help%20find%20a%20hostel%20near%20the%20Chennai%20centre%3F]]');
      await openAintra(page);
      const answer = await ask(page, 'Tell your team I need a hostel near Chennai');
      const card = answer.getByRole('region', { name: 'Message our team' });
      await card.getByLabel('Your name').fill('Priya');
      await card.getByRole('button', { name: 'Send message' }).click();
      await expect(card).toContainText('Enter your email so we can reply');
      expect(posted).toHaveLength(0);
      await card.getByLabel('Your email').fill('priya@example.com');
      await card.getByRole('button', { name: 'Send message' }).click();
      await expect(answer.getByRole('region', { name: 'Sent' })).toContainText('priya@example.com');
      expect(posted[0]).toMatchObject({ name: 'Priya', email: 'priya@example.com', subject: 'Hostel near Chennai' });
    });

    test('mobile: no horizontal scroll and 44px targets in the cards', async ({ page }) => {
      await mockChat(page, CALLBACK_ANSWER);
      await openAintra(page);
      await ask(page, 'Call me');
      await assertNoHorizontalOverflow(page);
      await assertTouchTargetSize(page, '[aria-labelledby^="aintra-callback-title"] button');
    });
  });

  test.describe('desktop', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('the callback card fits the drawer and its day row does not spill', async ({ page }) => {
      await mockChat(page, CALLBACK_ANSWER);
      await openAintra(page);
      const answer = await ask(page, 'Call me');
      const card = answer.getByRole('region', { name: 'Request a callback' });
      await expect(card).toBeVisible();
      const [cardBox, answerBox] = await Promise.all([card.boundingBox(), answer.boundingBox()]);
      expect((cardBox?.width ?? 0) <= (answerBox?.width ?? 0) + 1).toBe(true);
      await assertNoHorizontalOverflow(page);
    });
  });
});
